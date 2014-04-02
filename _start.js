/*///////////////////////////////////////////////////////////////////////////

 For Best results use the an 'app-config.json' file. This File should be
 located in the same directory as this file. If you choose not to use it
 then your application must run out of the same directory as this file
 and you entry point must be a file named 'start.js' located in this
 directory.

 'app-config.json' allows you to configure following properties for your
 application:

 "working_directory": <set this to the directory you application lives in>
 "app_entry": <set this to the name of the 'js' file that is your entry point>

 "pull_port": <set this to the port for a pull requests> - defaults to 8000

 // The key and cert files are only necessary if you want to listen for a pull
 // request securely. If they are omitted and HTTP server is start instead. Beware
 // as someone could be snooping and then start sending your servers pull requests
 "pull_key": <path to a ssh key file for the HTTPS Server>
 "pull_cert": <path to a ssh cert file for the HTTPS Server>
 "pull_ca": <array of paths to the certificate authority files> (optional)
 "pull_passphrase" : <string - phrase that the certificate was generated with> (optional if certificate was not generated with a passphrase)

 // This is a secret key that is configured here and passed in via a webhook in
 // response to a pull request. This is to prevent unauthorized requests from causing
 // pulls. If no pull secret is configure then all pull request are valid
 "pull_secret": <secret phrase>

 "branch": <git branch to use for the pull>

 // In theory you can put an cloud vendor specific params in here. You just have to have support in cloud.js for them.
 // Curently AWS is the only cloud platform supported
 // Put your AWS config params in here. Example:
 "accessKeyId": "XXXXXXXXXXXXXXXXXXXX",
 "secretAccessKey": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
 "region": "us-east-1"


 // This allows you to have the same codebase but turn off updating in certain production
 // environments.
 "off_key_pair": <key:value pair that when matched in the instance data turns off pulling>

 "aws_ignore:" <key:value pair that when set prevents any action> (useful for production servers)
 "sudo": <Mac and Linux only, should we prefix all shell commands with sudo?> - defaults to no sudo

 // To Trigger a pull and restart


 *////////////////////////////////////////////////////////////////////////////

(function (){
    var fs = require ('fs');
    var exec = require('child_process').exec;
    var path = require('path');
    var url = require('url');
    var qs = require ('querystring');
    var config_file, config, error, pull_error = "";
    var package_json, package_copy, parsed_package, parsed_copy;
    var restart = true;
    var need_restart = false;
    var http = require('http');
    var https = require('https');
    // This an abstraction layer for different cloud services
    // all AWS specific code or other cloud vendor stuff should go in here
    var cloud = require ("./cloud.js");
    var updating_on = true;
    var sudo;
    var in_pull = false;
    var instance_data;


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
            //console.log('STATUS: ' + res.statusCode);
            //console.log('HEADERS: ' + JSON.stringify(res.headers) + '\n');
            res.setEncoding('utf8');
            res.on('data', function (chunk) {result += chunk;});
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

    // pull the latest source
    function pull(cb, master, req){
        pull_error = "";
        function _pull (cb){
            console.log ("\nPulling the latest code from remote repository");
            // get the latest code
            var branch = config.branch || "master"; // defaults to master
            var child = exec (sudo + "git pull origin " + branch, function (err, std, ster){
                if (err){
                    console.log ("	Error pulling reposititory. Error" + ster);
                    pull_error += "\nError pulling reposititory. Error" + ster;
                }
                else{console.log ("	" + std);}
                cb && cb ();
            });
        }
        // only pull the latest if in the cloud. For local development don't do anything. The developer must manually pull
        if (cloud.isCloud ()){
            restart = (master || master === false);
            need_restart = false;
            if (!master){
                _pull (function (){
                    if (need_restart){
                        process.exit(0);
                    }
                    cb && cb ();
                });
            }
            else { // else we are the master so find all the other AWS instances to pull from
                // get other instances that our are same type and already running
                var secure = (req.href.search ("https://") !== -1);
                var instances = cloud.getInstances (function (instances){
                    instances && instances.forEach (function (instance){
                        if (instance.dns && instance.id !== cloud.getInstanceId ()){ // don't signal ourselves
                            post (instance.dns, req,body, config.pull_port, secure, url.format (req.query));
                        }
                    });
                    // now pull and restart ourselves
                    _pull (function (){
                        if (need_restart){
                            process.exit(0);
                        }
                        cb && cb ();
                    });
                });
            }
        }
        else {cb && cb ();}
    }
    // check if any NPM dependencies changed
    function checkNodeDependencies (cb){
        // read in our files
        console.log ("\nChecking for Node version changes");
        try { package_copy = fs.readFileSync ("package.copy");}
        catch (e) { package_copy = null;}
        try {package_json = fs.readFileSync ("package.json");}
        catch (e) { package_json = null;}
        parsed_package = (package_json) ? JSON.parse (package_json) : null;
        parsed_copy = (package_copy) ? JSON.parse (package_copy) : null;
        // see if our node versions match
        if (parsed_package && parsed_package.node_version){
            var version = parsed_package.node_version.replace ('v', "");
            var node_version = process.version.replace ('v', "");
            if (version !== node_version){
                console.log ("	Upgrading Node");
                console.log ("		current version:" + node_version);
                console.log ("		requested version:" + version);
                // upgrade node using 'n'
                var child = exec (sudo + "n " + version, function (err, std, ster){
                    if (err){
                        console.log ("		Node upgrade failed. Error:" + ster);
                        pull_error += "\nNode upgrade failed. Error:" + ster;
                    }
                    else{
                        console.log ("		Node upgrade success, restarting");
                        if (restart){ process.exit (0); }// exit so we get restarted
                        else { need_restart = true;}
                    }
                    cb & cb ();
                });
            }
            else{
                console.log ("  Node is up to date");
                console.log ("      current version:" + node_version);
                cb & cb ();
            }
        }
        else{
            console.log ("	Current Node version is:" + node_version);
            cb & cb ();
        }
    }

    // check for any node module changes and reinstall the associated packages.
    // NPM doesn't do a good job of keeping track. So keep a copy of the last successful
    // update and compare it. Find ones that have changed and delete them and the
    // re-install.
    function checkNPMDependencies (cb){
        function deleteRecursiveSync(itemPath) {
            if (fs.existsSync(itemPath)){
                if (fs.existsSync(itemPath) && fs.statSync(itemPath).isDirectory()) {
                    fs.readdirSync(itemPath).forEach(function(childItemName) {
                        deleteRecursiveSync(path.join(itemPath, childItemName));
                    });
                    fs.rmdirSync(itemPath);
                } else {
                    fs.unlinkSync(itemPath);
                }
            }
        }
        console.log ("\nChecking for Node Module dependency changes");
        if (!package_json){
            console.log ("WARNING Your Application has no 'package.json' . It is highly" +
                " recommended that you use one to manage your NPM dependencies");
        }
        else{ // delete the module that have changed and re-install with new versions
            if (!package_copy || package_copy.toString() !== package_json.toString ()){
                console.log ("	NPM depency changes detected");
                if (parsed_package && parsed_package.dependencies){
                    for (var package_name in parsed_package.dependencies){
                        var copy_version = (parsed_copy && parsed_copy.dependencies) ? parsed_copy.dependencies[package_name] : "";
                        if (copy_version !== parsed_package.dependencies[package_name]){
                            deleteRecursiveSync ("node_modules/" + package_name);
                        }
                    }
                }
                if (parsed_copy && parsed_copy.dependencies){
                    for (package_name in parsed_copy.dependencies){
                        copy_version = (parsed_package && parsed_package.dependencies) ? parsed_package.dependencies[package_name] : "";
                        if (copy_version !== parsed_copy.dependencies[package_name]){
                            deleteRecursiveSync ("node_modules/" + package_name);
                        }
                    }
                }
                var child = exec (sudo + "npm install -d", function (err, std, ster){
                    if (err){
                        console.log ("	Error installing Node` modules. Error:" + ster);
                        pull_error += "\nError installing Node` modules. Error:" + ster;
                    }
                    else{
                        console.log ("	Sucessfully update Node Modules: " + std);
                        fs.writeFileSync ("package.copy", package_json);
                    }
                    cb && cb ();
                });
            }
            else{
                console.log ("  No node module changes detected");
                cb && cb ();
            }
        }
    }
    // start the application
    function startApp (){
        var app_entry = config.app_entry || "start.js";
        console.log ("\nSTARTING APPLICATION CALLING: " + app_entry);
        require ('./' + app_entry);
    }

    /////////////////// CODE EXECUTION STARTS HERE ///////////////////////////
    console.log ("********** Node-Deploy Started *********");
    var date = new Date ();
    console.log (date.toString ());

    try {config_file = fs.readFileSync ("app-config.json");}
    catch (err){ error = err;}

    if (config_file){
        try {config = JSON.parse (config_file);}
        catch (err){ error = err;}
    }

    if (!config) {
        console.log ("	'app-config.json' is missing or invalid: Error:" + error);
        console.log ("	Continuing on with defaults");
        config = {};
    }
    // if nor configured this does nothing
    sudo = (config.sudo) ? "sudo " : "";

    // init the cloud code
    cloud.init (config, function (){
        instance_data = cloud.getInstanceData ();
        console.log ("\nGetting Cloud Data")
        console.log ("  Instance ID:" + cloud.getInstanceId ());
        console.log ("  Instance Data:%j", instance_data);

        // see if updating should be on or off
        if (instance_data && config.off_key_pair){
            var key = Object.keys(config.off_key_pair)[0];
            var val = config.off_key_pair[key];
            if (instance_data[key] === val){
                updating_on = false;
            }
        }

        // change directory to the app working directory. Default to the current directory
        var working_directory = config.working_directory || process.cwd();
        process.chdir (working_directory);
        console.log ("\nSetting Working Directory to:" + process.cwd());

        // determine if we are in the could or not and set an environment variable
        // in case other code needs to know this
        console.log ("\nServer in cloud: " + cloud.isCloud ());
        process.env['CLOUD'] = cloud.isCloud ();
        process.env['INSTANCE_ID'] = cloud.getInstanceId ();
        process.env['INSTANCE_DATA'] = cloud.getInstanceData ();


        function checkAndUpdateEnvironment (master){
            if (updating_on){
                // get the latest code
                pull (function (){
                    // check for dependency changes
                    checkNodeDependencies (function (){
                        checkNPMDependencies (function (){
                            startApp ();
                        });
                    });
                }, master);
            }
        }
        checkAndUpdateEnvironment (false);

        // create a server to listen for pull requests
        function handleRequests (req, res){
            function parseURL (req){
                var url_in = url.parse(req.url,true);
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
                        req.body = qs.parse(body);
                        if (func){func (req, res);}
                    });
                }
            }
            if (req.url.search ("/pull") !== -1){ // handle a command to pull
                var valid_request = true;
                parseURL (req);
                if (config.pull_secret){
                    valid_request = (req.query.secret == config.pull_secret) ? true : false;
                }
                if (valid_request){
                    bodyParser (req, res, function (){
                        if (req.body.ref.search (config.branch) !== -1){
                            pull (function (){
                                res.writeHead(200, {'Content-Type': 'text/plain'});
                                if (pull_error){ res.end("Pull Accepted. There were Errors:" + pull_error); }
                                else {res.end("Pull Accepted"); }
                                var date = new Date ();
                                console.log ("\nPull Command, master:" + req.query.master + " @" + date.toString ());
                                console.log ("	body:%j", req.body);
                                if (pull_error){
                                    console.log ("	There were Errors:%j", pull_error);
                                }
                            }, req.query.master, req);
                        }
                        else{
                            console.log ("\nIgnoring Pull Request, wrong branch. \n\tListening for: " + config.branch +
                                "\n\t Recieved:" + body.ref);
                        }
                    });
                }
                else{
                    res.res.writeHead(200, {'Content-Type': 'text/plain'});
                    res.end("Pull Not Authorized");
                    console.log ("\nPull Not Authorized @" + date.toString ());
                    console.log ("	Secret passed in:" + !!params.secret);
                    console.log ("	Secret required:" + !!config.pull_secret);
                    console.log ("	Secrets Match:" + (config.pull_secret === params.secret));
                }
            }
            else{
                res.res.writeHead(404, {'Content-Type': 'text/plain'});
                res.end("Not Found");
            }
        }
        if (updating_on || true){
            var http_port = (config.pull_port || 8000), key, cert, options;
            if (config.pull_key && config.pull_cert){
                try {key = fs.readFileSync (config.pull_key);}
                catch (err) {key = null;}
                try {cert = fs.readFileSync (config.pull_cert);}
                catch (err) {cert = null;}
                if (key && cert) {
                    options = {key:key, cert:cert,
                    ciphers: 'ECDHE-RSA-AES128-SHA256:AES128-GCM-SHA256:RC4:HIGH:!MD5:!aNULL:!EDH',
                    honorCipherOrder: true
                    };
                }
                if (options && config.pull_passphrase){
                    options.passphrase = config.pull_passphrase;
                }
                if (options && config.pull_ca && config.pull_ca.length){
                    var ca = [];
                    config.pull_ca.forEach (function (_ca){
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
                console.log ("\nHTTPS Pull Server Started. Listening on Port:" + http_port);
                https.createServer (options, handleRequests).listen (http_port);
            }
            else{
                console.log ("\nWARNING cert and key not specified or invalid. Falling back to HTTP");
                console.log ("HTTP Pull Server Started. Listening on Port:" + http_port);
                http.createServer (handleRequests).listen (http_port);
            }
        }
    });
 })();
