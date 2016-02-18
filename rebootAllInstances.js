/*
    // Reboots all the instances. This should be used for deploying the latest changes to development
 */

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

function getInstances (EC2, type, cb){
    var instances = [];
    var instanceMap = {};
    var async = require ("async");
    if (EC2){
        EC2.describeInstances (function(error, data) {
            if (error) { cb && cb (error);}
            else {
                async.eachSeries (data.Reservations, function (reservation, done){
                    async.eachSeries (reservation.Instances, function (instance, _done){
                        if (instance.PublicDnsName){
                            EC2.describeInstanceAttribute ({Attribute: "userData", InstanceId:instance.InstanceId}, function (err, data){
                                if (!err && data.UserData && data.UserData.Value){
                                    var userData = new Buffer(data.UserData.Value, 'base64').toString ();
                                    if (userData) {
                                        try{userData = JSON.parse (userData);}
                                        catch (err){}
                                    }
                                    if (userData && userData.type === type){
                                        var id = instance.InstanceId;
                                        if (!instanceMap[id]){
                                            instances.push ({id:id, dns:instance.PublicDnsName,
                                                userData:userData});
                                            instanceMap[id] = true;
                                        }
                                    }
                                }
                                _done ();
                            });
                        } else {
                            _done ();
                        }
                    }, function (){
                        done ();
                    });
                }, function (err){
                    cb && cb (err, instances);
                });
            }
        });
    }
    else { cb && cb ("AWS is not configured correctly"); }

}

function init (_params, cb) {
    var error;
    var EC2;
    var AWS = require('aws-sdk');
    var params;

    // get Params
    if (!_params) {
        var argv = require('minimist')(process.argv.slice(2));
        var params = {};
        params.awsFileName = argv.aws;
        params.type = argv.type;
    }
    else{
        params = _params;
    }

    // config AWS
    if (!params.awsFileName) {
        error = "Missing AWS config file name";
        cb(error);
    }
    else if (!params.type) {
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
                EC2 = AWS && new AWS.EC2();
                params.AWS = AWS;
                params.EC2 = EC2;
                cb(null, params);
            }
            else {
                cb(error);
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
            getInstances(params.EC2, params.type, function (err, instances) {
                if (!err) {
                    var instanceIds = [];
                    if (instances && instances.length) {
                        for (var i = 0; i < instances.length; ++i) {
                            instanceIds.push(instances[i].id);
                        }
                        params.EC2.rebootInstances({InstanceIds: instanceIds, DryRun: false}, function (err, data) {
                            if (err) {
                                exit("EC2 Error", cb);
                            }
                            else {
                                console.log("Successfully rebooted (" + instances.length + ")");
                                exit(null, cb);
                            }
                        });
                    }
                    else {
                        console.log("No Instances found");
                        exit(null, cb);
                    }

                }
                else {
                    exit(err, cb);
                }
            });
        }
    });
}

var isModule = !(process.argv[1].indexOf ('rebootAllInstances.js') !== -1);

// if this isn't being called from module pull the parmas off of the commandline
if (!isModule) {
    main (null, function (err, result){
        if (err){
            console.log ("Error: " + err);
        }
        else{
            console.log (result);
        }
        exit (err);
    });
}

// else this is being loaded as a module so support a cb and passing in the params
else {
    exports.reboot = function (awsFileName, type, cb) {
        main ({awsFileName:awsFileName, type:type}, function (err, result){
            cb && cb (err, result);
        });
    }
}

