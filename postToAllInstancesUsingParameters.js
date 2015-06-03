

var local_path = (require.resolve("./cloud.js")).replace("cloud.js", "");
var config = require("./config").data;
var https = require("https");
var http = require("http");
var cloud = require("./cloud.js");
var async = require("async");

function postToAllInstances(params, callback) {
    // pass in the route, defaults to '/pull'. Can be '/pull', '/restart' or '/rebuild'
    if (!params) {
        callback('params must be set');
    } else if (!params.route) {
        callback("No route is specified");
    } else if (!params.params) {
        callback("No instance type is specified");
    } else {
        var route = params.route;
        var instance_data = params.params

// optional command line params we want to set. Should be in the form of a JSON string. Useful for app-cache time stamps
// and versions, etc...
        var args = params.args;
        args = args || {};

// post a command out
        function post(url, body, port, secure, path, cb) {
            var qs = require('querystring');
            body = qs.stringify(body);
            var options = {
                host: url,
                port: port,
                path: path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': body.length
                },
                rejectUnauthorized: false // add this so if someone uses a local certificate on the machine the post will still go through
            };

            var server = (secure) ? https : http;
            var req = server.request(options, function (res) {
                var result = "";
                res.setEncoding('utf8');
                res.on('data', function (chunk) {
                    result += chunk;
                });
                res.on('end', function () {
                    cb(null, result);
                });
            });
            req.on('error', function (e) {
                console.log('problem with request: ' + e.message);
                cb(e.message);
            });

            // write data to request body
            req.write(body);
            req.end();
            //console.log ("posted to " + url + " waiting for response....");
        }

// go get all the instances and post to them
        cloud.init(function () {
            var body = {};
            var key = config.pullField || "ref";
            var branch = instance_data.listensTo || config.pullBranch;
            var secure = (config.appURL.search("https://") !== -1);
            var path = route + "?";
            if (config.pullSecret) {
                path += "secret=" + config.pullSecret + "&";
            }
            path += "master=false";
            if (instance_data && (instance_data.secure !== undefined || instance_data.secure !== null)) {
                secure = instance_data.secure;
            }

            // grab any params passed as a JSON and set them in the body
            if (typeof args === "object") {
                body.args = JSON.stringify(args);
            }
            else {
                body.args = args;
            }
            body[key] = branch;

            if (instance_data) {
                cloud.setInstanceData(instance_data);
                console.log("Finding Instances");
                cloud.getInstances(function (err, instances) {
                    if (instances && instances.length) {
                        console.log("Found " + instances.length + " instances, posting pull request.");
                        async.map(instances, function (instance, cb) {
                            if (instance.dns) {
                                console.log("Posting to: " + instance.dns + " waiting for result...");
                                post(instance.dns, body, config.pullPort, secure, path, function (err, result) {
                                    console.log("\nPosted " + route + " to:" + instance.dns);
                                    console.log("\tport:" + config.pullPort);
                                    console.log("\tsecure:" + secure);
                                    console.log("\tbody:%j", body);
                                    if (err) {
                                        callback(err);
                                        console.log("\n\tError:" + err);
                                    }
                                    else {
                                        callback(null, result);
                                        console.log("\n\tResult:" + result);
                                    }

                                });
                            }
                            else {
                                callback();
                            }
                        }, function () {
                            callback();
                        });
                    }
                    else {
                        callback("No instances found");
//                        exit(0);
                    }
                });
            }
            else {
                callback("Error posting to instances, instance data json string no passed in or corrupt");
//                exit(1);
            }
        });
    }
}

module.exports.postToAllInstances = postToAllInstances;




