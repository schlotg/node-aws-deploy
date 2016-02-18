/*
 // Reboots all the instances. This should be used for deploying the latest changes to development
 */

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

function getAMIS (EC2, cb){
    var async = require ("async");
    if (EC2){
        EC2.describeImages ({Owners:['self']}, function(err, data) {
            cb && cb (err, data.Images);
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
                EC2 = AWS && new AWS.EC2();
                params.AWS = AWS;
                params.EC2 = EC2;
                cb(null, params);
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
            getAMIS(params.EC2, function (err, amis) {
                if (!err) {
                    if (amis && amis.length){
                        var newest = {id:'', ts:0}, ami;
                        for (var i = 0; i < amis.length; ++i){
                            ami = amis[i];
                            var ts = (new Date(ami.CreationDate)).getTime();
                            if (ts > newest.ts){
                                newest.ami = ami;
                                newest.ts = ts;
                            }
                        }
                        exit(err, cb, newest.ami);
                    }
                    else{
                        exit(err, cb);
                    }
                }
                else {
                    exit(err, cb);
                }
            });
        }
    });
}

// if this isn't being called from module pull the parmas off of the commandline
var isModule = !(process.argv[1].indexOf ('getLastCreatedAMI.js') !== -1);
if (!isModule) {
    main (null, function (err, result){
        if (err){
            console.log ("Error: " + err);
        }
        else{
            console.log (result && result.ImageId);
        }
        exit (err);
    });
}

// else this is being loaded as a module so support a cb and passing in the params
else {
    exports.getLastAMI = function (awsFileName, cb) {
        main ({awsFileName:awsFileName}, function (err, result){
            cb && cb (err, result);
        });
    }
}

