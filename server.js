var url = require('url');
var config = require ('./config.js');
var configData = config.data;
var http = require('http');
var https = require('https');
var qs = require ('querystring');
var secure_post = false;
var pull_field = configData.pullField || "ref";
var restart = false;
var POST_MESSAGE_SIZE = 65536; // limit the most someone can post to 64k
var deploy = false;
var fs = require('fs');

// this function restarts the application
function restart (code){
    code = code || 0;
    console.log ("Restarting the app. If you launched this manually you will have to re-launch manually");
    setTimeout (function (){
        process.exit (code);
    }, 1000);
}

// start up our pull server
function startServer (instance_data, checkAndUpdateEnvironment, cb){
    deploy = instance_data && instance_data.deploy;
    // create a server to listen for pull requests
    function handleRequests (req, res){
        function parseURL (req){
            var url_in = url.parse (req.url, true);
            req.query = url_in.query;
            req.href = url_in.href;
        }
        function bodyParser (req, res, func){
            if (req.method == 'POST') {
                var body = '';
                req.on('data', function (data) {
                    body += data;
                    if (body.length > POST_MESSAGE_SIZE) { // limit the most data someone can send
                        request.connection.destroy();
                    }
                });
                req.on('end', function () {
console.log ("post data:" + body);
                    try{req.body = JSON.parse (body);}
                    catch (e){req.body = qs.parse (body);}
                    if (func){func (req, res);}
                });
            }
            res.send = function (str){
                this.writeHead(404, {'Content-Type': 'text/plain'});
                this.end(str);
            };
        }
        // handle pull requests, only pull if deploy is set to true
        if (req.url.search ("/pull") !== -1 && deploy){ // handle a command to pull
            var valid_request = true;
            parseURL (req);
            if (configData.pullSecret){
                valid_request = (req.query.secret == configData.pullSecret) ? true : false;
            }
            if (valid_request){
                bodyParser (req, res, function (){
                    var listensTo = (instance_data && instance_data.listensTo) ? instance_data.listensTo : "";
                    req.body[pull_field] = req.body[pull_field] || "";
                    if (req.body[pull_field].search (listensTo) !== -1){
                        if (req.body.args){
                            var args;
                            try {args = JSON.parse (req.body.args);}
                            catch (e){}
                            args = args || req.body.args;
                            if (args){ // only save these out if we have new ones
                                restart = false;
                                console.log ("\tApplying pullArgs:%j", args);
                                if (typeof args === 'string'){
				                    if (configData.pullArgs !== args){
                                    	configData.pullArgs = args;
					                    restart = true;
				                    }
                                }
                                else{
                                    configData.pullArgs = configData.pullArgs || {};
                                    for (var k in args){
                                        if (configData.pullArgs[k] !== args[k]){
                                            configData.pullArgs[k] = args[k];
                                            restart = true;
                                        }
                                    }
                                }
                                config.update ();
                            }
                            else{
                                console.log ("\tNo pullArgs passed in");
                            }
                        }

                        var _master = req.query.master;
                        checkAndUpdateEnvironment (restart, function (){
                            res.send("Pull Accepted");
                            var date = new Date ();
                            console.log ("\nPull Command, master:" + _master + " @" + date.toString ());
                        }, req.query.master, req, res);
                    }
                    else{
                        var msg = "\nIgnoring Pull Request, wrong branch. \n\tListening for: " + listensTo +
                            "\n\t Recieved:" + req.body[pull_field];
                        console.log (msg);
                        res.send ("Ignoring Pull Request, wrong branch.");
                    }
                });
            }
            else{
                res.send ("Pull Not Authorized");
                console.log ("\nPull Not Authorized");
            }
        }
        else if (req.url.search ("/restart") !== -1){
            var valid_request = true;
            parseURL (req);
            if (configData.pullSecret){
                valid_request = (req.query.secret == configData.pullSecret) ? true : false;
            }
            if (valid_request){
                res.send ("Restarting");
                console.log ("\nRestart command received. Restarting...");
                restart (0);
            }
            else {
                res.send ("Restart Not Authorized");
                console.log ("\nRestart Not Authorized");
            }
        }
        else if (req.url.search ("/rebuild") !== -1 && deploy){
            var valid_request = true;
            parseURL (req);
            if (configData.pullSecret){
                valid_request = (req.query.secret == configData.pullSecret) ? true : false;
            }
            if (valid_request){

                // blow away the package.json copy and restart
                if (config.data.applicationDirectory){
                    var packageCopy = config.data.applicationDirectory + '/package.copy';
                    try {fs.unlinkSync (packageCopy);}
                    catch (e){}
                    // now blow away all the dependency package.copy files
                    if (configData.dependencies && configData.homePath){
                        configData.dependencies.forEach (function (dependency){
                            packageCopy = configData.homePath + "/" + dependency + "/package.copy";
                            try {fs.unlinkSync (packageCopy);}
                            catch (e){}
                        });
                    }
                    res.send ("Rebuilding");
                    console.log ("\nRebuild command received. Rebuilding...");
                    restart (0); // restart
                }else{
                    res.send ("node-aws-deploy is not configured properly");
                }
            }
            else{
                res.send ("Rebuild Not Authorized");
                console.log ("\nRebuild Not Authorized");
            }
        }
        else{
            res.send ("Unrecognized command");
            console.log ("\nUnrecognized command");
        }
    }
    var http_port = (configData.pullPort || 8000), key, cert, options;
    if (configData.pullKey && configData.pullCert){
        try {key = fs.readFileSync (configData.pullKey);}
        catch (err) {key = null;}
        try {cert = fs.readFileSync (configData.pullCert);}
        catch (err) {cert = null;}
        if (key && cert) {
            options = {key:key, cert:cert,
                ciphers: 'ECDHE-RSA-AES128-SHA256:AES128-GCM-SHA256:RC4:HIGH:!MD5:!aNULL:!EDH',
                honorCipherOrder: true
            };
        }
        if (options && configData.pullPassphrase){
            options.passphrase = configData.pullPassphrase;
        }
        if (options && configData.pullCa && configData.pullCa.length){
            var ca = [];
            configData.pullCa.forEach (function (_ca){
                try {__ca = fs.readFileSync (_ca, {encoding: "aascii"});}
                catch (err) {__ca = null;}
                if (__ca){ ca.push (__ca);}
            });
            if (ca.length){
                options.ca = ca;
            }
        }
    }
    if (key && cert){
        secure_post = true;
        console.log ("\nHTTPS Pull Server Started. Listening on Port:" + http_port);
        https.createServer (options, handleRequests).listen (http_port);
    }
    else{
        secure_post = false;
        console.log ("\nWARNING cert and key not specified or invalid. Falling back to HTTP");
        console.log ("HTTP Pull Server Started. Listening on Port:" + http_port);
        http.createServer (handleRequests).listen (http_port);
    }
    cb && cb ();
}

exports.startServer = startServer;
