/*
    Post commands to the node-aws-deploy server
    Finds all running instances and issues the command.
    Currently the node-aws-deploy server supports the following commands '/pull', '/restart' and '/rebuild'
    commands. Specify the the type, route, and arguments.

    This code finds all the servers that have user data that matches the
    type passed in and issues the command to them.

    Additionally the /pull command allows you to specify additional arguments that are set on the command line.
    These are stored in the .app-config.json and are applied to the instances every time they restart. This is useful
    for passing up version info, app-cache dates, etc...

    // example shell script for pulling:

         cd your_application_directory/node-aws-deploy
         echo Enter type:
         read type
         echo Enter the version:
         read version
         dateTime=$(date +"%m-%d-%y%T")
         route="/pull"
         args="{\"version\":\"$version\",\"appCacheDate\":\"$dateTime\"}"
         params="{\"type\":\"$type\",\"listensTo\":\"master\",\"secure\":false}"
         echo -e "\nSignaling Servers to Pull. Waiting for server response...\n"
         node postToAllInstances.js $route $params $args
 */

// this function exits but allows time for things to get flushed.
function exit (code){
    code = code || 0;
    setTimeout (function (){
        process.exit (code);
    }, 1000);
}

var local_path =  (require.resolve ("./cloud.js")).replace ("cloud.js", "");
var config = require ("./config").data;
var https = require ("https");
var http = require ("http");
var cloud = require ("./cloud.js");
var async = require ("async");

// pass in the route, defaults to '/pull'. Can be '/pull', '/restart' or '/rebuild'
var route = process.argv[2];
if (!route){
    console.log ("No route is specified");
    exit (1);
}

// Pass in the instance type params (JSON)
var instance_data = process.argv[3];
if (instance_data){
    try {instance_data = JSON.parse (instance_data);}
    catch (e){console.log ("Error parsing instance type JSON: %j", e);}
}
if (!instance_data){
    console.log ("No instance type is specified");
    exit (1);
}

// optional command line params we want to set. Should be in the form of a JSON string. Useful for app-cache time stamps
// and versions, etc...
var args = process.argv[4];
if (args){
    try {args = JSON.parse (args);}
    catch (e){console.log ("Error parsing args JSON: %j", e);}
}
args = args || {};

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
    //console.log ("posted to " + url + " waiting for response....");
}

// go get all the instances and post to them
cloud.init (function (){
    var body = {};
    var key = config.pullField || "ref";
    var branch = instance_data.listensTo || config.pullBranch;
    var secure = (config.appURL.search ("https://") !== -1);
    var path = route + "?";
    if (config.pullSecret) {path += "secret=" + config.pullSecret + "&";}
    path += "master=false";
    if (instance_data && (instance_data.secure !== undefined || instance_data.secure !== null)){
        secure = instance_data.secure;
    }

    // grab any params passed as a JSON and set them in the body
    body.args = JSON.stringify(args);
    body[key] = branch;

    if (instance_data){
        cloud.setInstanceData (instance_data);
        console.log ("Finding Instances");
        cloud.getInstances (function (err, instances){
            if (instances && instances.length){
                console.log ("Found " + instances.length + " instances, posting pull request.");
                async.map (instances, function (instance, cb){
                    if (instance.dns){
                        console.log ("Posting to: " + instance.dns + " waiting for result...");
                        post (instance.dns, body, config.pullPort, secure, path, function (err, result){
                            console.log ("\nPosted " + route + " to:" + instance.dns);
                            console.log ("\tport:" + config.pullPort);
                            console.log ("\tsecure:" + secure);
                            console.log ("\tbody:%j", body);
                            if (err){console.log ("\n\tError:" + err);}
                            else{console.log ("\n\tResult:" + result);}
                            cb ();
                        });
                    }
                    else {cb ();}
                }, function () {exit (0);});
            }
            else{
                console.log ("No instances found");
                exit (0);
            }
        });
    }
    else{
        console.log ("Error posting to instances, instance data json string no passed in or corrupt");
        exit (1);
    }
});
