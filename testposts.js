// Simple file to simulate a webhook

var https = require ("https");
var http = require ("http");

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
}

var url = "ec2-54-82-234-63.compute-1.amazonaws.com";
var body = {ref:"develop"};
var port = 8000;
var secure = true;
var path = "/pull?secret=no_limits&master=true";
post (url, body, port, secure, path, function (err, result){
    if (err){
        console.log ("Error during post:" + err);
    }
    else {
        console.log ("Post successful! response:" + result);
    }
    process.exit (0);
});