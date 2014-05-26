var exec = require('child_process').exec;
var AWS = require ('aws-sdk');
var async = require ('async');
var EC2;
var config = require('./config');

/* IMPLEMENTS THE AWS VERSIONS OF:
 getInstanceId ()
 getInstanceData ()
 isCloud ()

 WARNING CALL INIT FIRST OR THE OTHER FUNCTIONS WILL ALL RETURN NULL
 */

function createCloudInterface() {

    var instance_id;
    var instance_user_data = {};
    var configData = config.data;

    return {
        // this must be called first to init everything
        init: function (cb){
            console.log (config.path);

            if (configData && configData.accessKeyId && configData.secretAccessKey && configData.region){
                var error;
                try {AWS && AWS.config.loadFromPath(config.path + '/.app-config.json');}
                catch (err){error = err;}
                finally { if (!error) {EC2 = AWS && new AWS.EC2();} }
            }

            var child = exec ('wget -q -O - http://169.254.169.254/latest/meta-data/instance-id', function (err, std, ster){
                // get our instance id
                if(!err){instance_id= std;}
                else{instance_id = "None";}
                // if this is an AWS instance go get the instance user data
                if (instance_id !== "None"){
                    var child2 = exec ('wget -q -O - http://169.254.169.254/latest/user-data', function (err, std, ster){
                        // get our instance user data
                        if(!err && std){
                            try { instance_user_data = JSON.parse(std);}
                            catch (err) {instance_user_data = std;}
                        }
                        cb && cb ();
                    });
                }
                else{ cb && cb ();}
            });
        },
        // get the instance id for this instance
        getInstanceId: function() {
            return instance_id;
        },
        // get the instance data for this instance
        setInstanceData: function(data) {
            instance_user_data = data;
        },
        // get the instance data for this instance
        getInstanceData: function() {
            return instance_user_data;
        },
        // is this instance on the cloud
        isCloud: function (){
            return (instance_id && instance_id !== "None");
        },
        // get all the instances associated with this AWS account and with the same data type set in user data
        getInstances: function (cb){
            var instances = [];
            var instance_map = {};
            if (EC2){
                EC2.describeInstances(function(error, data) {
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
    };
};

var cloud = createCloudInterface ();
for (var func in cloud){
    exports[func] = cloud[func];
}