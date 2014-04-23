// Simple file to simulate a webhook
var local_path =  (require.resolve ("./cloud.js")).replace ("cloud.js", "");
var config = require (local_path + ".app-config.json") || {};
var https = require ("https");
var http = require ("http");
var cloud = require ("./cloud.js");
var async = require ("async");

// Pass in the instance data that you want to post to, should be in the form of a json string
var instance_data = process.argv[2];
try {instance_data = JSON.parse (instance_data);}
catch (err){}


// post a command out
function post (url, body, port, secure, path, cb){
    var qs = require('querystring');
    body = qs.stringify (body);
    var options = {
        host: url,
        port: port,
        path: path,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': body.length
        },
        rejectUnauthorized:false // add this so if someone uses a local certificate on the machine the post will still go through
    };

    var server = (secure) ? https : http;
    var req = server.request(options, function(res) {
        var result = "";
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            result += chunk;
        });
        res.on('end', function (){
            cb (null, result);
        });
    });
    req.on('error', function(e) {
        console.log('problem with request: ' + e.message);
        cb (e.message);
    });

    // write data to request body
    req.write(body);
    req.end();
    console.log ("posted to " + url + " waiting for response....");
}

// go get all the instances and post to them
cloud.init (config, function (){
    var body = {};
    var key = config.pullField || "ref";
    var branch = config.pullBranch || instance_data.listensTo;
    body[key] = branch;
    var secure = (config.appURL.search ("https://") !== -1);
    var path = "/pull?";
    if (config.pullSecret) {path += "secret=" + config.pullSecret + "&";}
    path += "master=false";

    if (instance_data){
        cloud.setInstanceData (instance_data);
        cloud.getInstances (function (err, instances){
            if (instances && instances.length){
                console.log ("Found " + instances.length + " instances, posting pull request.");
                async.map (instances, function (instance, cb){
                    post (instance.dns, body, config.pullPort, secure, path, function (err, result){
                        console.log ("\nPosted pull to:" + instance.dns);
                        console.log ("\tport:" + config.pullPort);
                        console.log ("\tsecure:" + secure);
                        console.log ("\tpath:" + path);
                        console.log ("\tbody:" + body);
                        if (err){console.log ("\n\tError:" + err);}
                        else{console.log ("\n\tResult:" + result);}
                        cb ();
                    });
                }, function () {process.exit (0);});
            }
            else{
                console.log ("No instances found");
                process.exit (0);
            }
        });
    }
    else{
        console.log ("Error posting to instances, instance data json string no passed in or corrupt");
        process.exit (0);
    }
});
