var url = require('url');
var config = require ('./config.js');
var configData = config.data;
var http = require('http');
var https = require('https');
var qs = require ('querystring');
var secure_post = false;


// start up our pull server
function startServer (checkAndUpdateEnvironment, cb){
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
                    if (body.length > 524488) { // limit the most data someone can send to 1/2 a meg
                        request.connection.destroy();
                    }
                });
                req.on('end', function () {
                    try{req.body = JSON.parse (body);}
                    catch (e){req.body = qs.parse (body);}
                    if (func){func (req, res);}
                });
            }
        }
        if (req.url.search ("/pull") !== -1){ // handle a command to pull
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
                            configData.pullArgs = req.body.args;
                            config.update ();
                        }

                        var _master = req.query.master;
                        checkAndUpdateEnvironment (function (){
                            res.writeHead(200, {'Content-Type': 'text/plain'});
                            if (pull_error){ res.end("Pull Accepted. There were Errors:" + pull_error); }
                            else {res.end("Pull Accepted"); }
                            var date = new Date ();
                            console.log ("\nPull Command, master:" + _master + " @" + date.toString ());
                            //console.log ("	body:%j", req.body);
                            if (pull_error){
                                console.log ("	There were Errors:%j", pull_error);
                            }
                        }, req.query.master, req, res);
                    }
                    else{
                        var msg = "\nIgnoring Pull Request, wrong branch. \n\tListening for: " + listensTo +
                            "\n\t Recieved:" + req.body[pull_field];
                        console.log (msg);
                        res.writeHead(404, {'Content-Type': 'text/plain'});
                        res.end("Ignoring Pull Request, wrong branch.");
                    }
                });
            }
            else{
                res.writeHead(200, {'Content-Type': 'text/plain'});
                res.end("Pull Not Authorized");
                console.log ("\nPull Not Authorized @" + date.toString ());
                console.log ("	Secret passed in:" + !!(req.query.secret));
                console.log ("	Secret required:" + !!configData.pullSecret);
                console.log ("	Secrets Match:" + (configData.pullSecret === req.query.secret));
            }
        }
        else{
            res.writeHead(404, {'Content-Type': 'text/plain'});
            res.end("Not Found");
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
