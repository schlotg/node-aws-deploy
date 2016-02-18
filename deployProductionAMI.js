/*
 // Reboots all the instances. This should be used for deploying the latest changes to development
 */

var async = require ("async");

// move the cursor up one line
function moveCursorUp () {
    process.stdout.write('\033[1A\r');
}

// this function exits but allows time for things to get flushed.
function exit (err, cb, result){
    if (!cb) {
        var code = (err) ? 1 : 0;
        setTimeout(function () {
            process.exit(code);
        }, 1000);
    }
    else {
        cb (err, result);
    }
}



// Find the load balancer Returns -> cb (err, instanceId)
function getInstanceFromLoadBalancer(params, cb){
    var ELB, EC2;
    ELB = params.AWS && new params.AWS.ELB();
    EC2 = params.AWS && new params.AWS.EC2();

    console.log ("Looking for Load Balancer: " + params.lbName);

    if (ELB && EC2){
        if (params.lbName ){
            ELB.describeLoadBalancers({LoadBalancerNames: [params.lbName]}, function( error, data) {
                if (error) { cb && cb (error);}
                // now grab the first healthy instance associated with it
                else {
                    var instanceId;
                    var attachedInstances = [];
                    params.loadBalancer = data.LoadBalancerDescriptions[0];
                    async.eachSeries (data.LoadBalancerDescriptions[0].Instances, function (instance, done){
                            attachedInstances.push (instance.InstanceId);
                            // check that the instance state is healthy
                            if (!instanceId){
                                EC2.describeInstanceStatus ({InstanceIds:[instance.InstanceId]}, function (error, data){
                                    if (error) {done (error);}
                                    else{
                                        if (data.InstanceStatuses && data.InstanceStatuses[0].InstanceState.Name === 'running'){
                                            instanceId = instance.InstanceId;
                                            params.instanceId = instanceId;
                                        }
                                        console.log ("Found Load Balancer: " + params.lbName);
                                        done ();
                                    }
                                });
                            }
                            else { done ();}
                        },
                        function (err){
                            params.attachedInstances = attachedInstances;
                            if (err) { cb && cb (err);}
                            else {cb && cb (null, params);}
                        }
                    );
                }
            });
        }
        else { cb && cb ("LoadBalanceName not specified"); }
    }
    else { cb && cb ("AWS is not configured correctly"); }
}

// get the scale group from an instance. Returns -> cb (err, scaleGroup)
function getScaleGroup (params, cb){
    var AUTO = params.AWS && new params.AWS.AutoScaling();
    if (AUTO){
        if (params.instanceId){
            AUTO.describeAutoScalingInstances ({InstanceIds:params.attachedInstances}, function (error, data){
                if (error) { cb && cb (error);}
                else{
                    params.AutoScalingInstances = data.AutoScalingInstances;
                    // find the instance we are using to clone off of
                    var instance;
                    var scaleGroupNames = [];
                    for (var i = 0; i < data.AutoScalingInstances.length; ++i){
                        if (data.AutoScalingInstances[i].InstanceId === params.instanceId){
                            instance = data.AutoScalingInstances[i];
                            scaleGroupNames.push (instance.AutoScalingGroupName);
                        }
                    }
                    var scaleGroupName = instance && instance.AutoScalingGroupName;
                    AUTO.describeAutoScalingGroups ({AutoScalingGroupNames:scaleGroupNames}, function (error, data){
                        if (error) { cb && cb (error);}
                        else{
                            params.AutoScalingGroups = data.AutoScalingGroups;
                            var scaleGroup;
                            for (var i = 0; i < data.AutoScalingGroups.length; ++i){
                                if (data.AutoScalingGroups[i].AutoScalingGroupName === scaleGroupName){
                                    scaleGroup = data.AutoScalingGroups[i];
                                    break;
                                }
                            }
                            if (scaleGroup){
                                params.scaleGroup = scaleGroup;
                                params.LaunchConfigurationName = scaleGroup.LaunchConfigurationName;
                                console.log ("Found a Scale Group: " + scaleGroupName);
                                cb && cb (null, params);
                            }
                            else{
                                cb && cb ("Couldn't find a scale group");
                            }
                        }
                    });
                }
            });
        }
        else {cb && cb ("InstanceID not specified");}
    }
    else {cb && cb ("AWS is not configured correctly");}
}

// get the scaling policies assocaited with this scale group
function getScalingPolicies (params, cb){
    var AUTO = params.AWS && new params.AWS.AutoScaling();
    if (AUTO){
        if (params.scaleGroup){
            AUTO.describePolicies ({AutoScalingGroupName:params.scaleGroup.AutoScalingGroupName}, function (error, data){
                if (error) { cb && cb (error);}
                else{
                    params.scalingPolicies = data.ScalingPolicies;
                    cb && cb (null, params);
                }
            });
        }
        else {cb && cb ("ScaleGroup not specified");}
    }
    else {cb && cb ("AWS is not configured correctly");}
}

// Get the launch configuration. Returns -> cb (err, launchConfiguration)
function getLaunchConfiguration (params, cb){
    var AUTO = params.AWS && new params.AWS.AutoScaling();
    if (AUTO){
        if (params.LaunchConfigurationName){
            AUTO.describeLaunchConfigurations ({LaunchConfigurationNames:[params.LaunchConfigurationName]}, function (error, data){
                if (error) { cb && cb (error);}
                else{
                    var launchConfig = data.LaunchConfigurations && data.LaunchConfigurations[0];
                    params.launchConfig = launchConfig;
                    console.log ("Found Launch Configuration: " + params.LaunchConfigurationName);
                    cb && cb (null, params);
                }
            });
        }
        else {cb && cb ("launchConfigurationName not specified");}
    }
    else {cb && cb ("AWS is not configured correctly");}
}

// Create a launch configuration
function createLaunchConfiguration (params, cb){
    var AUTO = params.AWS && new params.AWS.AutoScaling();
    if (AUTO){
        if (params.launchConfig){
            var configParams = {};
            var excludeList = {
                CreatedTime:true,
                LaunchConfigurationARN:true
            };

            for (var k in params.launchConfig){
                var val = params.launchConfig[k];
                if (val && !(excludeList[k])) {
                    configParams[k] = val;
                }
            }
            configParams.ImageId = params.amiName;
            configParams.LaunchConfigurationName = params.lbName + '-lc-' + params.ver;

            AUTO.createLaunchConfiguration (configParams, function (err, data){
                params.LaunchConfigurationName = configParams.LaunchConfigurationName;
                console.log ("Created Launch Configuration: " + params.LaunchConfigurationName);
                cb && cb (err, params);
            });
        }
        else{cb && cb ("Launch Configuration params not specified");}
    }
    else {cb && cb ("AWS is not configured correctly");}
}

// Create Auto Scale group
function createScaleGroup (params, cb){
    var AUTO = params.AWS && new params.AWS.AutoScaling();
    if (AUTO){
        if (params.scaleGroup){
            var configParams = {};
            var excludeList = {
                CreatedTime:true,
                AutoScalingGroupARN:true,
                Instances: true,
                SuspendedProcesses: true,
                EnabledMetrics: true
            };

            for (var k in params.scaleGroup){
                var val = params.scaleGroup[k];
                if (val && !(excludeList[k])) {
                    configParams[k] = val;
                }
            }

            var name = params.lbName + "-ec2-" + params.ver;

            configParams.LaunchConfigurationName = params.LaunchConfigurationName;
            configParams.AutoScalingGroupName = params.lbName + '-asg-' + params.ver;

            var tagEntry={
                Key:"Name",
                PropagateAtLaunch: true,
                ResourceId: configParams.AutoScalingGroupName,
                ResourceType:"auto-scaling-group",
                Value: name
            };

            // make the sure the 'Name' tag is added properly
            var tagAdded = false;
            configParams.Tags.every (function (tag, i){
                var _continue = true;
                if (tag.Key === "Name"){
                    tagAdded = true;
                    _continue = false;
                    configParams.Tags[i] = tagEntry;
                }
                return _continue;
            });
            if (!tagAdded){
                configParams.Tags.push (tagEntry);
            }

            AUTO.createAutoScalingGroup (configParams, function (err, data){
                params.AutoScalingGroupName = configParams.AutoScalingGroupName;
                console.log ("Created Scale Group: " + configParams.AutoScalingGroupName);
                console.log ("Added Scale Group to Load Balancer: " + params.loadBalancerName);
                cb && cb (err, params);
            });
        }
        else{cb && cb ("Scale Group params not specified");}
    }
    else {cb && cb ("AWS is not configured correctly");}
}
// get the new Scale Group
function getNewScaleGroup (params, cb){
    var AUTO = params.AWS && new params.AWS.AutoScaling();
    if (AUTO){
        var scaleGroupName = params.AutoScalingGroupName;
        var dots = '';
        console.log ("Finding New Scale Group: " + scaleGroupName + "\n");
        function _getNewScaleGroup () {
            AUTO.describeAutoScalingGroups ({AutoScalingGroupNames:[scaleGroupName]}, function (error, data){
                if (error) { cb && cb (error);}
                else{
                    var scaleGroup = data.AutoScalingGroups && data.AutoScalingGroups[0];
                    params.scaleGroup = scaleGroup;
                    params.LaunchConfigurationName = scaleGroup.LaunchConfigurationName;
                    if (scaleGroup.MinSize <= scaleGroup.Instances.length){
                        console.log ("Found New Scale Group: " + scaleGroupName + " and " +
                            scaleGroup.Instances.length + " instance(s)");
                        params.newInstances = scaleGroup.Instances;
                        cb && cb (null, params);
                    }
                    else {
                        moveCursorUp ();
                        dots += '.';
                        console.log (dots);
                        setTimeout (_getNewScaleGroup, 3000);
                    }
                }
            });
        }
        _getNewScaleGroup ();
    }
    else {cb && cb ("AWS is not configured correctly");}
}

function setScalingPolcies (params, cb){
    var AUTO = params.AWS && new params.AWS.AutoScaling();
    var CLOUDWATCH = params.AWS && new params.AWS.CloudWatch();
    var alarmIndex = 0;
    if (AUTO && CLOUDWATCH){
        if (params.scaleGroup && params.scalingPolicies){
            async.eachSeries(params.scalingPolicies, function (policy, done){

                var configParams = {};
                var excludeList = {
                    PolicyARN:true,
                    Alarms:true
                };
                if (policy.PolicyType === 'SimpleScaling'){
                    excludeList.StepAdjustments=true;
                }
                for (var k in policy){
                    var val = policy[k];
                    if (val && !(excludeList[k])) {
                        configParams[k] = val;
                    }
                }
                configParams.AutoScalingGroupName = params.scaleGroup.AutoScalingGroupName;

                AUTO.putScalingPolicy (configParams, function (err, data){
                    if (!err && data){
                        params.policyARNs = params.policyARNs || [];
                        params.policyARNs.push (data.PolicyARN);
                        var policyARN = data.PolicyARN;
                        // now create the alarm for this
                        if (policy.Alarms.length){
                            CLOUDWATCH.describeAlarms ({AlarmNames:[policy.Alarms[0].AlarmName]}, function (err, data){
                                if (!err && data && data.MetricAlarms){
                                    var alarmParams = {};
                                    var alarm = data.MetricAlarms[0];
                                    ++alarmIndex;
                                    var excludeList = {
                                        AlarmArn: true,
                                        AlarmConfigurationUpdatedTimestamp: true,
                                        StateValue:true,
                                        StateReason:true,
                                        StateReasonData:true,
                                        StateUpdatedTimestamp:true
                                    };
                                    for (var k in alarm){
                                        var val = alarm[k];
                                        if (val && !(excludeList[k])) {
                                            alarmParams[k] = val;
                                        }
                                    }
                                    // set the AutoScalingGroupName
                                    var dim = alarmParams.Dimensions;
                                    for (var i = 0; i < dim.length; ++i){
                                        var pair = dim[i];
                                        if (pair.Name === "AutoScalingGroupName"){
                                            pair.Value = configParams.AutoScalingGroupName;
                                            break;
                                        }
                                    }
                                    // set the actions correctly
                                    var actions = alarmParams.AlarmActions;
                                    for (var i = 0; i < actions.length; ++i){
                                        var action = actions[i];
                                        if (action.indexOf("autoscaling") !== -1){
                                            actions[i] = policyARN;
                                            break;
                                        }
                                    }
                                    alarmParams.AlarmName = params.scaleGroup.AutoScalingGroupName + "-" + alarmIndex;
                                    ++alarmIndex;
                                    CLOUDWATCH.putMetricAlarm (alarmParams, function (err, data){
                                        console.log ("Added Alarm: " + alarmParams.AlarmName);
                                        done (err);
                                    });
                                }
                                else {done (err);}
                            });
                        }
                        else {
                            console.log ("No Alarms Found");
                            done (err);
                        }
                    }
                    else { done (err);}
                });
            }, function (err){
                cb && cb (err, params);
            });
        }
        else {cb && cb ("ScaleGroup or ScalingPolicies not specified");}
    }
    else {cb && cb ("AWS is not configured correctly");}
}

// Keep polling until instances are ready
function areInstancesReady (params, cb){
    var ELB, EC2;
    ELB = params.AWS && new params.AWS.ELB();
    if (ELB){
        if (params.lbName){
            console.log ("Checking that the new instances are ready. This might take a few minutes \n");
            var dots = '';
            function describeInstanceHealth (){
                ELB.describeInstanceHealth({LoadBalancerName: params.lbName}, function( error, data) {
                    if (error) { cb && cb (error);}
                    // now check if the instances are ready
                    else {
                        var stateMap = {};
                        for (var i = 0; i < params.newInstances.length; ++i){
                            stateMap[params.newInstances[i].InstanceId] = false;
                        }
                        var readyCount = 0;
                        var states = data.InstanceStates;
                        for (i = 0; i < states.length; ++i){
                            if (states[i].State === "InService" && stateMap[states[i].InstanceId] === false){
                                stateMap[states[i]] = true;
                                ++readyCount;
                            }
                        }
                        // if Ready
                        if (readyCount === params.newInstances.length){
                            console.log ("New Instances are in service");
                            cb && cb (null, params);
                        }
                        else {
                            moveCursorUp ();
                            dots += '.';
                            console.log (dots);
                            setTimeout (describeInstanceHealth, 5000);
                        }
                    }
                });
            }
            describeInstanceHealth ();
        }
        else { cb && cb ("LoadBalanceName not specified"); }
    }
    else { cb && cb ("AWS is not configured correctly"); }
}

// Remove the old scale groups and launch configurations
function removeOldScaleGroups (params, cb){
    var AUTO = params.AWS && new params.AWS.AutoScaling();
    if (AUTO){
        if (params.del){
            console.log ("Removing old Scale Groups and Launch configurations");
            async.eachSeries (params.AutoScalingInstances, function (instance, done) {
                if (instance.InstanceId === params.instanceId){
                    AUTO.deleteAutoScalingGroup ({AutoScalingGroupName:instance.AutoScalingGroupName, ForceDelete:true}, function (err, data){
                        AUTO.deleteLaunchConfiguration ({LaunchConfigurationName:instance.LaunchConfigurationName}, function (err, data){
                            done ();
                        });
                    });
                }
                else{
                    console.log ("Can't find Old Scale Group");
                    done ();
                }
            }, function (err){
                cb && cb (err, params);
            });
        }
        else {
            cb && cb (null, params);
        }
    }
    else {cb && cb ("AWS is not configured correctly");}
}

function verifyScalingPoliciesAreInPlace (params, cb){
    var AUTO = params.AWS && new params.AWS.AutoScaling();
    if (AUTO){
        var request = {
            AutoScalingGroupName: params.AutoScalingGroupName//,
            //MaxRecords: 0,
            //PolicyTypes: ['SimpleScaling', 'StepScaling']
        };
        AUTO.describePolicies (request, function (err, data){
            if (data && data.ScalingPolicies && data.ScalingPolicies.length >= 2){
                console.log ("Found the following scaling polices:");
                data.ScalingPolicies.forEach (function (policy){
                    console.log ("\t" + policy.PolicyName);
                });
                cb && cb (null, params);
            }
            else{
                cb && cb ("WARNING SCALING POLICIES DO NOT APPEAR TO BE IN PLACE PLEASE MANUALLY VERIFY");
            }
        });
    }
    else {cb && cb ("AWS is not configured correctly");}
}


function init (_params, cb) {
    var error;
    var AWS = require('aws-sdk');
    var params;

    // get Params
    if (!_params) {
        var argv = require('minimist')(process.argv.slice(2));

        var params = {};
        params.awsFileName = argv.aws;
        params.lbName = argv.name;
        params.ami = argv.ami;
        params.ver = argv.ver;
        params.del = argv.del;

    }
    else{
        params = _params;
    }

    // config AWS
    if (!params.awsFileName) {
        error = "Missing AWS config file name";
        cb(error);
    }
    else {
        try {
            AWS && AWS.config.loadFromPath(params.awsFileName);
        }
        catch (err) {
            error = err;
        }
        finally {
            if (!error) {
                params.AWS = AWS;
                params.EC2 = new AWS.EC2();
                params.ELB = new AWS.ELB();
                params.AUTO = new AWS.AutoScaling ();
                cb (null, params);
            }
            else {
                cb (error);
            }
        }
    }
}

function main (params, cb){
    init (params, function (err, params) {
        if (err) {
            exit(err, cb);
        }
        else {
            // CODE EXECUTION STARTS HERE
            async.waterfall ([
                    function (done){done (null, params);},
                    getInstanceFromLoadBalancer,
                    getScaleGroup,
                    getScalingPolicies,
                    getLaunchConfiguration,
                    createLaunchConfiguration,
                    createScaleGroup,
                    getNewScaleGroup,
                    setScalingPolcies,
                    areInstancesReady,
                    removeOldScaleGroups,
                    verifyScalingPoliciesAreInPlace
                ],
                function (err, params){
                    if (err){
                        exit (err, cb);
                    }
                    else{
                        exit (err, cb, params.ver);
                    }
                }
            );
        }
    });
}

// if this isn't being called from module pull the parmas off of the commandline
var isModule = !(process.argv[1].indexOf ('deployProductionAMI.js') !== -1);
if (!isModule) {
    main (null, function (err, result){
        if (err){
            console.log ("Error: " + err);
        }
        else{
            console.log ("Successfully deployed:" + (result && result.ImageId));
        }
        exit (err);
    });
}

// else this is being loaded as a module so support a cb and passing in the params
else {
    exports.deploy = function (awsFileName, lbName, amiName, ver, del, cb) {
        main ({awsFileName:awsFileName, lbName:lbName, amiName:amiName, ver:ver, del:del}, function (err, result){
            cb && cb (err, result);
        });
    }
}

