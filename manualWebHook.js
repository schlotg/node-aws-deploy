// Simple file to simulate a webhook

var config = require ("./config").data;
var https = require ("https");
var http = require ("http");

// You can pass in the branch you want to post as a parameter and override the settings in config
var _branch = process.argv[2];
config.pullBranch = _branch || config.pullBranch;

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

var body = {};

var key = config.pullField || "ref";
var branch = config.pullBranch || "master";
body[key] = branch;
var secure = (config.appURL.search ("https://") !== -1);
var url = config.appURL.replace ("https://", "").replace ("http://", "");
var path = "/pull?";

if (url){

    if (config.pullSecret){
        path += "secret=" + config.pullSecret + "&";
    }
    path += "master=true";
    console.log ("Posting web hook to:%s\n\tbody:%j\n\tport:%s\n\tpath", config.appURL, body, config.pullPort, path);
    post (url, body, config.pullPort, secure, path, function (err, result){
        if (err){
            console.log ("Error during post:" + err);
        }
        else {
            console.log ("Post successful! response:" + result);
        }
        process.exit (0);
    });
}
else{
    console.log ("No url set - aborting");
    process.exit (0);
}