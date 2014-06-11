var local_path =  (require.resolve ("./makeAMI.js")).replace ("makeAMI.js", "");
var config = require ("./config").data;
var async = require ("async");
var AWS = require ('aws-sdk');
var EC2;

// Pass in the instance data that you want to post to, should be in the form of a json string
var instance_data = process.argv[2];
// pass in command line params we want to set. Useful for app-cache time stamps and versions
var args = process.argv[3];

try {args = JSON.parse (args);}
catch (e){ args = []; console.log (e);}

try {instance_data = JSON.parse (instance_data);}
catch (err){}

// Initialize AWS
var error;
try {AWS && AWS.config.loadFromPath(local_path + '.app-config.json');}
catch (err){error = err;}
finally {
    if (!error) {
        EC2 = AWS && new AWS.EC2();
        console.log ("AWS Initialized");
    }
    else{
        console.log ("Unable to initialize AWS. Error:" + error);
        process.exit (0);
    }
}
var instance_user_data = instance_data;
// get all the instances associated with this AWS account and with the same data type set in user data
function getInstances(cb){
    var instances = [];
    var instance_map = {};
    if (EC2){
        EC2.describeInstances(function(error, data) {
            console.log ("Filtering instances");
            if (error) { cb && cb (error);}
            else {
                async.eachSeries (data.Reservations, function (reservation, done){
                    async.eachSeries (reservation.Instances, function (instance, _done){
                        if (instance.PublicDnsName){
                            EC2.describeInstanceAttribute ({Attribute: "userData", InstanceId:instance.InstanceId}, function (err, data){
                                if (!err && data.UserData && data.UserData.Value){
                                    var user_data = new Buffer(data.UserData.Value, 'base64').toString ();
                                    if (user_data) {
                                        try{user_data = JSON.parse (user_data);}
                                        catch (err){}
                                    }
                                    if (user_data.type && instance_user_data.type && user_data.type === instance_user_data.type){
                                        var id = instance.InstanceId;
                                        if (!instance_map[id]){
                                            instances.push ({id:id, dns:instance.PublicDnsName,
                                                user_data:user_data});
                                            instance_map[id] = true;
                                        }
                                    }
                                    else if (instance_user_data.type && !user_data.type && instance_user_data.type === user_data){
                                        var id = instance.InstanceId;
                                        if (!instance_map[id]){
                                            instances.push ({id:id, dns:instance.PublicDnsName,
                                                user_data:user_data});
                                            instance_map[id] = true;
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


// No errors, create the AMI
if (!error){
    // find an instance running the code we want
    getInstances (function (err, instances){
        if (err || !instances || !instances.length){
            if (err){
                console.log ("Error searching for EC2 Instances:" + err );
                process.exit (1);
            }
            else{
                console.log ("No instances found!");
                process.exit (1);
            }
        }
        else{ // else get the first instance and create an AMI

            var instance = instances[0];
            console.log ("Found an Instance. Creating AMI from instance:" + instance.id);
            var request = {
                InstanceId:instance.id,
                Name: args && args.name || "",
                Description: args && args.description || "AMI Created automatically through 'node-aws-deploy'"
            };
            console.log ("Creating an image");
            EC2.createImage (request, function (err, image){
                if (err){
                    console.log ("Error creating image:%j", err);
                    process.exit (1);
                }
                else{
                    console.log ("Image creation in progress. Data:%j", image);
                    function pollAMI () {
                        function poll (){
                            EC2.describeImages ({ImageIds:[image.ImageId]}, function (err, imageData){
                                if (err){
                                    console.log ('err:%j', err);
                                }
                                else{
                                    console.log ('imageData:%j', imageData);
                                    var imageState = imageData.Images[0] && imageData.Images[0].State;
                                    if (imageState === 'pending'){
                                        console.log ('.');
                                        pollAMI ();
                                    }
                                    else{
                                        if (imageState === 'failed'){
                                            console.log ("Image creation failed, state:" + imageState);
                                            process.exit (1);
                                        }
                                        else{
                                            console.log ("Image created successfully, state:" + imageState);
                                            process.exit (0);
                                        }
                                    }
                                }
                            });
                        }
                        setTimeout (poll, 15000);
                    }
                    pollAMI ();
                }
            });
        }
    });
}

