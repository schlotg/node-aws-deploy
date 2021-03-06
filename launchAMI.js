// Launches an AMI into a lc then scale group and then attaches it to a running ec2 load balancer. After the scale group is is confirmed running,
// any older scale groups attached to the load balancer are terminated if removeOldInstances is true
// The bash script to launch it would look something like:
/*
 # Put your project directory here:
 cd ~/your_project_directory/node-aws-deploy
 echo "Enter the id of the AMI (required)"
 read amiId
 echo "Enter the name Load Balancer to deploy to (require)"
 read loadBalancerName
 echo "Enter the deployment name"
 read deploymentName
 echo "Enter the deployment version"
 read deploymentVersion
 echo "Do you want to delete the old instances after deployment? (yes/no)"
 read removeOldInstances
 if [ "$removeOldInstances" = "yes" ]; then
    removeOldInstances=true
 else
    removeOldInstances=false
 fi

 params="{\"amiId\":\"$amiId\",\"loadBalancerName\":\"$loadBalancerName\",\"deploymentName\":\"$deploymentName\",\"deploymentVersion\":\"$deploymentVersion\",\"removeOldInstances\":$removeOldInstances}"
 node launchAMI.js "$params"
 */

var local_path =  (require.resolve ("./launchAMI.js")).replace ("launchAMI.js", "");
var config = require ("./config").data;
var async = require ("async");
var AWS = require ('aws-sdk');

// move the cursor up one line
function moveCursorUp () {
    process.stdout.write('\033[1A\r');
}

// pass in args in a json
var args = process.argv[2] || {};

try {args = JSON.parse (args);}
catch (e){ args = {}; console.log ("Error parsing input params: %j", e);}

// Initialize AWS
var error;
try {AWS && AWS.config.loadFromPath(local_path + '.app-config.json');}
catch (err){error = err;}

// kick everything off in the waterfall
function init (cb){
    var loadBalancerName = args && args.loadBalancerName;
    var error = '';
    if (!AWS) {error += "AWS could not be initialized, ";}
    if (!loadBalancerName) {error = "LoadBalancer Name not specified, ";}
    if (!args.deploymentName) {error = "Deployment name not specified, ";}
    if (!args.deploymentVersion) {error = "Deployment version not specified, ";}
    cb && cb (error, {args:args, AWS:AWS, loadBalancerName:loadBalancerName});
}

// Find the load balancer Returns -> cb (err, instanceId)
function getInstanceFromLoadBalancer(params, cb){
    var ELB, EC2;
    ELB = params.AWS && new params.AWS.ELB();
    EC2 = params.AWS && new params.AWS.EC2();

    if (ELB && EC2){
        if (params.loadBalancerName){
            ELB.describeLoadBalancers({LoadBalancerNames: [params.loadBalancerName]}, function( error, data) {
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
                                        console.log ("Found Load Balancer: " + params.loadBalancerName);
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
            configParams.ImageId = params.args.amiId;
            configParams.LaunchConfigurationName = params.args.deploymentName + '-lc-' + params.args.deploymentVersion;

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

            var name = params.args.deploymentName + "-ec2-" + params.args.deploymentVersion;

            configParams.LaunchConfigurationName = params.LaunchConfigurationName;
            configParams.AutoScalingGroupName = params.args.deploymentName + '-asg-' + params.args.deploymentVersion;

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
        if (params.loadBalancerName){
            console.log ("Checking that the new instances are ready. This might take a few minutes \n");
            var dots = '';
            function describeInstanceHealth (){
                ELB.describeInstanceHealth({LoadBalancerName: params.loadBalancerName}, function( error, data) {
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
        if (params.args.removeOldInstances){
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

function getVersion (params, cb){
    console.log ("Verifying Version");
    var https = require ('https');
    var route = (params.loadBalancer && params.loadBalancer.DNSName);
    var options = {
        hostname: route,
        rejectUnauthorized: false,
        path:'/version'
    };

    var version;
    var count = 0;
    var limit = 100;
    var dots='';

    function _getVersion (cb) {
        https.get(options, function (res) {
            res.on('data', function (d) {
                var version = d && d.toString();
                if (version.indexOf('403 Error') === -1) {
                    cb(version);
                }
                else {
                    cb();
                }
            });
        }).on('error', function (e) {
            cb();
        });
    }
    // do to connection draining, we might have to try several times to get the right result back
    async.whilst(
        function () { return !version && count < limit },
        function (done) {
            count++;
            _getVersion (function (_version){
                if (_version === args.deploymentVersion){
                    version = _version;
                    done ();
                }else{
                    version = null;
                    setTimeout(done, 1000);
                    moveCursorUp ();
                    dots += '.';
                    console.log (dots);
                }
            });
        },
        function () {
            if (version){
                params.version = version;
                cb && cb (null, params);
            }
            else{
                cb && cb ("Could not get the correct version back from the new server(s)");
            }
        }
    );
}

// CODE EXECUTION STARTS HERE
async.waterfall ([

    init,
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
    verifyScalingPoliciesAreInPlace,
    getVersion

],
    function (err, params){
        if (err){
            console.error ("There were errors trying to launch this AMI:");
            console.error (err);
        }
        else{
            console.log ("Successfully deployed AMI:" + params.version);
        }
    }
);
