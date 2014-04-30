var exec = require('child_process').exec;
var AWS = require ('aws-sdk');
var EC2;

/* IMPLEMENTS THE AWS VERSIONS OF:
 getInstanceId ()
 getInstanceData ()
 isCloud ()

 WARNING CALL INIT FIRST OR THEO OTHER FUNCTIONS WILL ALL RETURN NULL
 */

function createCloudInterface() {

    var instance_id;
    var instance_user_data = {};
    var config;

    return {
        // this must be called first to init everything
        init: function (_config, cb){
            config = _config;
            var _path, config_path;
            /*if (process.env["WORKING_DIR"]){
                _path = process.env["WORKING_DIR"]; // support cluster
                _path = (_path) ? _path + "/" : "";
                config_path = _path + '.app-config.json';
            }
            else {*/
                _path =  (require.resolve ("./cloud.js")).replace ("cloud.js", "");
                config_path = _path + '.app-config.json';
            //}
            console.log (_path);

            if (config && config.accessKeyId && config.secretAccessKey && config.region){
                var error;
                try {AWS && AWS.config.loadFromPath(config_path);}
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
            if (EC2){
                EC2.describeInstances(function(error, data) {
                    if (error) { cb && cb (error);}
                    else {
                        if (data.Reservations.length){
                            var count = data.Reservations.length;
                            // are we done?
                            function isDone (){
                                --count;
                                if (count <= 0) { cb && cb (null, instances);}
                            }
                            data.Reservations.forEach (function (revervation){
                                revervation.Instances.forEach (function (instance){
                                    EC2.describeInstanceAttribute ({Attribute: "userData", InstanceId:instance.InstanceId}, function (err, data){
                                        if (!err && data.UserData && data.UserData.Value){
                                            var user_data = new Buffer(data.UserData.Value, 'base64').toString ();
                                            if (user_data) {
                                                try{user_data = JSON.parse (user_data);}
                                                catch (err){}
                                            }
                                            if (user_data.type && instance_user_data.type && user_data.type === instance_user_data.type){
                                                instances.push ({id:instance.InstanceId, dns:instance.PublicDnsName,
                                                    user_data:user_data});
                                            }
                                            else if (instance_user_data.type && !user_data.type && instance_user_data.type === user_data){
                                                instances.push ({id:instance.InstanceId, dns:instance.PublicDnsName,
                                                    user_data:user_data});
                                            }
                                        }
                                        isDone ();
                                    });
                                });
                            });
                        }
                        else { cb && cb (null, instances);}
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