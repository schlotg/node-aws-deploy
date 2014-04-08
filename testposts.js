// Simple file to testing posting from webhooks

var https = require ("https");
var http = require ("http");

// post a command out
function post (url, body, port, secure, path, cb){
    var qs = require('querystring');
console.log ("2");
    body = qs.stringify (body);
console.log ("3");
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
        //console.log('STATUS: ' + res.statusCode);
        //console.log('HEADERS: ' + JSON.stringify(res.headers) + '\n');
        res.setEncoding('utf8');
        res.on('data', function (chunk) {result += chunk;});
        res.on('end', function (){
            cb (null, result);
        });
console.log ("4");
    });
    req.on('error', function(e) {
        console.log('problem with request: ' + e.message);
        cb (e.message);
console.log ("5");
    });

    // write data to request body
console.log ("6");
    req.write(body);
    req.end();
console.log ("7");
}

var url = "http://ec2-54-205-55-16.compute-1.amazonaws.com/";
var body = "master";
var port = 8000;
var secure = (url.search ("https:") !== -1);
var path = "/pull";
console.log ("1");
post (url, body, port, secure, path, function (err, result){
    if (err){
        console.log ("Error during post:" + err);
    }
    else {
        console.log ("Post successful! respose:" + result);
    }
    process.exit (0);
});