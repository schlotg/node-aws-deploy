/*///////////////////////////////////////////////////////////////////////////

 For Best results use the an 'app-config.json' file. This File should be
 located in the same directory as this file. If you choose not to use it
 then your application must run out of the same directory as this file
 and you entry point must be a file named 'start.js' located in this
 directory.

 'app-config.json' allows you to configure following properties for your
 application:


 "awsUpdates:" <Check for and get this latest AWS updates on a pull>
 "applicationName:" <name of the application>
 "applicationDirectory": <set this to the directory you application lives in>
 "applicationPath": <the path to the application directory>
 "appEntry": <set this to the name of the 'js' file that is your entry point>
 "commandArguments": <command line arguments you would like pass to the application>
 "appEnvironmentVariables": <{<key>:<pair>}, key pair environment variables that need to be se for the application >
 "appURL": <https://myapp> used for manual webhooks
 "dependencies" : <dependencies within the package.json that need to be pulled in addition to the application directory>


 "pullPort": <set this to the port for a pull requests> - defaults to 8000

 // The key and cert files are only necessary if you want to listen for a pull
 // request securely. If they are omitted and HTTP server is start instead. Beware
 // as someone could be snooping and then start sending your servers pull requests
 "pullKey": <path to a ssh key file for the HTTPS Server>
 "pullCert": <path to a ssh cert file for the HTTPS Server>
 "pullCa": <array of paths to the certificate authority files> (optional)
 "pullPassphrase" : <string - phrase that the certificate was generated with> (optional if certificate was not generated with a passphrase)

 // This is a secret key that is configured here and passed in via a webhook in
 // response to a pull request. This is to prevent unauthorized requests from causing
 // pulls. If no pull secret is configure then all pull request are valid
 "pullSecret": <secret phrase>

 "pullBranch": <git branch to use for the pull>
 "pullField": <field that contains the branch information on a post by the web hook (defaults to 'ref')>

 // In theory you can put an cloud vendor specific params in here. You just have to have support in cloud.js for them.
 // Curently AWS is the only cloud platform supported
 // Put your AWS config params in here. Example:
 "accessKeyId": "XXXXXXXXXXXXXXXXXXXX",
 "secretAccessKey": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
 "region": "us-east-1"

 "sudo": <Mac and Linux only, should we prefix all shell commands with sudo?> - defaults to no sudo

 // This file must conform the following interface: It must have a start function that is exported that excepts a callback
 // as a parameter and calls the callback when compete to start the application.
 "preLaunch": <a javascript file to execute relative to the application directory before starting the app>

 // To Trigger a pull and restart


 *////////////////////////////////////////////////////////////////////////////

(function (){
    var fs = require ('fs');
    var exec = require('child_process').exec;
    var path = require('path');
    var url = require('url');
    var qs = require ('querystring');
    var cluster = require ('cluster');
    var async = require ('async');
    var config_file, config, error, pull_error = "";
    var package_json, package_copy, parsed_package, parsed_copy;
    var restart = false;
    var need_restart = false;
    var http = require('http');
    var https = require('https');
    // This an abstraction layer for different cloud services
    // all AWS specific code or other cloud vendor stuff should go in here
    var cloud = require ("./cloud.js");
    var updating_on = false;
    var sudo;
    var instance_data;
    var secure_post;
    var pull_field;
    var pull_list;

    // renove non-standard quotation marks and replace them with the standard ones
    function conditionString (str){
        var open = String.fromCharCode(147);
        var close = String.fromCharCode(148);
        return str && str.replace(open,'"').replace(close,'"');
    }


    // post a command out
    function post (_url, body, port, secure, path, cb){
        var qs = require('querystring');
        body = qs.stringify (body);
        var options = {
            host: _url,
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
            res.on('data', function (chunk) {result += chunk;});
            res.on('end', function (){
                cb && cb (null, result);
            });
        });
        req.on('error', function(e) {
            console.log('problem with request: ' + e.message);
            cb && cb (e.message);
        });

        // write data to request body
        req.write(body);
        req.end();
    }

    // pull the latest source
    function pull(cb, master, req, res){
        master = (master === true || master === "true");
        pull_error = "";
        need_restart = false;
        if (!pull_list){
            pull_list = [config.applicationDirectory];
            if (config.dependencies){
                config.dependencies.forEach (function (proj){
                    pull_list.push (config.applicationPath + proj);
                });
            }
        }
        function _pull (cb){
            console.log ("Pulling the latest code from remote repository");
            async.eachSeries (pull_list, function (proj, cb){
                // get the latest code
                console.log ("\nPulling " + proj);
                var child = exec ("cd " + proj + " ; " + sudo + "git pull", function (err, std, ster){
                    if (err){
                        console.log ("\n\nError pulling repository. Error" + ster);
                        pull_error += "\n\nError pulling repository. Error" + ster;
                    }
                    else{
                        console.log ("\n\n" + std);
                        if (std && std.search ("Already up-to-date") === -1){
                            need_restart = true;
                        }
                    }
                    cb ();
                });
            }, function (err){
                cb && cb ();
            });
        }
        // only pull the latest if in the cloud. For local development don't do anything. The developer must manually pull
        if (cloud.isCloud ()){
            if (!master){
                _pull (function (){
                    if (need_restart && restart){
                        if (pull_error){
                            res && res.send('They were errors pulling. Errors:' + pull_error);
                        }
                        else{
                            res && res.send('Pull Successful!');
                        }
                        res.send('hello world');
                        process.exit(0);
                    }
                    cb && cb ();
                });
            }
            else { // else we are the master so find all the other AWS instances to pull from
                // get other instances that our are same type and already running
                req.query.master = false;
                cloud.getInstances (function (err, instances){
                    if (instances && instances.length){
                        console.log ("Found " + instances.length + " instances, re-posting.");
                        instances.forEach (function (instance){
                            if (instance.dns && instance.id !== cloud.getInstanceId ()){ // don't signal ourselves
                                post (instance.dns, req.body, config.pullPort, secure_post, url.format ({pathname:"/pull", query:req.query}));
                            }
                        });
                        // now pull and restart ourselves
                        _pull (function (){
                            if (need_restart && restart){
                                if (pull_error){
                                    res && res.send('They were errors pulling. Errors:' + pull_error);
                                }
                                else{
                                    res && res.send('Pull Successful!');
                                }
                            }
                            cb && cb ();
                        });
                    }
                    else{
                        console.log ("No instances found");
                        cb && cb ();
                    }
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
        if (parsed_package && parsed_package.nodeVersion){
            var version = parsed_package.nodeVersion.replace ('v', "");
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
                        process.exit (0); // exit so we get restarted
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
            cb & cb ();
        }
    }

    // check AWS dependencies
    function checkAWSDependencies (cb){
        if (!config.local && instance_data.deploy){
            var child = exec("sudo yum -y update", function (err, std, ster){
                console.log ("\nChecking for AWS Updates\n" + std);
                if (err) {cb (ster);}
                else {cb ();}
            });
        }
        else {cb ();}
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
                        deleteRecursiveSync (path.join (itemPath, childItemName));
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
                        console.log ("	Error installing Node modules. Error:" + ster);
                        pull_error += "\nError installing Node modules. Error:" + ster;
                    }
                    else{
                        console.log ("	Successfully updated Node Modules: " + std);
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

    function checkAndUpdateEnvironment (cb, master){
        if (updating_on || config.remote === 'n'){
            // get the latest code
            pull (function (){
                // check for dependency changes
                checkAWSDependencies (function (){
                    checkNodeDependencies (function (){
                        checkNPMDependencies (function (){
                            cb && cb ();
                        });
                    });
                });
            }, master);
        }
    }

    // start the application
    function startApp (){

        // set command line args
        if (config.commandArguments){
            var args = config.commandArguments.split (" ");
            if (cluster.isMaster){ // only output this info once
                console.log ("Set the following Command Line Arguments:\n\t" + config.commandArguments);
            }
            args && args.forEach (function (arg){
                process.argv.push (arg);
            });
        }
        else if (cluster.isMaster) {
            console.log ("No Command Line Arguments set!");
        }
        // set environment variables
        if (config.appEnvironmentVariables){
            var env_vars;
            try {env_vars = JSON.parse (conditionString(config.appEnvironmentVariables));}
            catch (err) {console.log ("Error parsing the environment variables JSON:" + err);}
            if (env_vars){
                if (cluster.isMaster){ // only output this info once
                    console.log ("Set the following Environment Variables:");
                    console.log (env_vars);
                }
                for (var k in env_vars){
                    process.env[k] = env_vars[k];
                }
            }
        }
        else if (cluster.isMaster){
            console.log ("No Environment Variables set!");
        }

        // call the prelaunch file if available
        var workingDirectory = config.applicationDirectory || process.cwd();
        if (cluster.isMaster && config.preLaunch){
            console.log ("Processing preLaunch File: " + config.preLaunch);
            var pre_launch = require (workingDirectory + '/' + config.preLaunch);
            pre_launch.start (function (){
                _start ();
            });
        }
        else{ // no prelaunch file or not master
            _start ();
        }

        function _start (){

            // enter the application
            var appEntry = config.appEntry || "start.js", date;
            if (cluster.isMaster){
                date = new Date ();
                console.log ("\n\n********************************************************************************");
                console.log ("\tSTARTING APPLICATION %s", config.applicationName);
                console.log ("\tCALLING: %s", appEntry);
                console.log ("\t\tDate:" + date.toUTCString ());
                console.log ("********************************************************************************\n\n");
            }
            require (workingDirectory + '/' + appEntry);
            restart = true;
        }
    }

    /////////////////// CODE EXECUTION STARTS HERE ///////////////////////////
    
    if (cluster.isMaster){
        console.log ("********** Node-Deploy Started *********");
        var date = new Date ();
        console.log (date.toString ());
        console.log ("working directory:" + process.cwd ());
        //process.env["WORKING_DIR"] = process.cwd ();
    }

    var _path =  (require.resolve ("./_start.js")).replace ("_start.js", "");



    //var _path = process.env["WORKING_DIR"];// support cluster
    //_path = (_path) ? _path + "/" : "";
    try {config_file = fs.readFileSync (_path + ".app-config.json");}
    catch (err){ error = err;}

    if (config_file){
        try {config = JSON.parse (conditionString(config_file.toString ()));}
        catch (err){ error = err;}
    }

    if (!config) {
        console.log ("	'.app-config.json' is missing or invalid: Error:" + error);
        console.log ("	Continuing on with defaults");
        config = {};
    }

    pull_field = config.pullField || "ref";

    // if nor configured this does nothing
    sudo = (config.sudo) ? "sudo " : "";

    if (cluster.isMaster){
        // init the cloud code
        cloud.init (config, function (){
            instance_data = cloud.getInstanceData ();
            console.log ("\nGetting Cloud Data")
            console.log ("  Instance ID:" + cloud.getInstanceId ());
            console.log ("  Instance Data:%j", instance_data);

            // see if updating should be on or off
            if (instance_data && instance_data.deploy === true){
                updating_on = true;
            }

            // change directory to the app working directory. Default to the current directory
            var workingDirectory = config.applicationDirectory || process.cwd();
            console.log ("\nWorking Directory is:" + process.cwd());
            process.chdir (workingDirectory);
            console.log ("Setting Working Directory to:" + process.cwd());

            // determine if we are in the could or not and set an environment variable
            // in case other code needs to know this
            console.log ("\nServer in cloud: " + cloud.isCloud ());
            process.env['CLOUD'] = cloud.isCloud ();
            process.env['INSTANCE_ID'] = cloud.getInstanceId ();
            process.env['INSTANCE_DATA'] = JSON.stringify (cloud.getInstanceData ());

            checkAndUpdateEnvironment (function (){
                startApp ();
            }, false);

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
                    if (config.pullSecret){
                        valid_request = (req.query.secret == config.pullSecret) ? true : false;
                    }
                    if (valid_request){
                        bodyParser (req, res, function (){
                            var listensTo = (instance_data && instance_data.listensTo) ? instance_data.listensTo : "";
                            req.body[pull_field] = req.body[pull_field] || "";
                            if (req.body[pull_field].search (listensTo) !== -1){
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
                        console.log ("	Secret required:" + !!config.pullSecret);
                        console.log ("	Secrets Match:" + (config.pullSecret === req.query.secret));
                    }
                }
                else{
                    res.writeHead(404, {'Content-Type': 'text/plain'});
                    res.end("Not Found");
                }
            }
            if (updating_on){
                var http_port = (config.pullPort || 8000), key, cert, options;
                if (config.pullKey && config.pullCert){
                    try {key = fs.readFileSync (config.pullKey);}
                    catch (err) {key = null;}
                    try {cert = fs.readFileSync (config.pullCert);}
                    catch (err) {cert = null;}
                    if (key && cert) {
                        options = {key:key, cert:cert,
                            ciphers: 'ECDHE-RSA-AES128-SHA256:AES128-GCM-SHA256:RC4:HIGH:!MD5:!aNULL:!EDH',
                            honorCipherOrder: true
                        };
                    }
                    if (options && config.pullPassphrase){
                        options.passphrase = config.pullPassphrase;
                    }
                    if (options && config.pullCa && config.pullCa.length){
                        var ca = [];
                        config.pullCa.forEach (function (_ca){
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
            }
            else {
                console.log ("NO PULL SERVER STARTED!!!");
                startApp ();
            }
        });
    }
    else{
        startApp ();
    }
})();
