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

 "logger" : <bool> must be set to false to turn the logger off
 "logSize": <number> size of the log in bytes. The built in logger limits the size that the log file can be. Default is 64MB, acts as a circular buffer

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



// create a class to capture stdout. Logs it to the file specified
// doesn't let the log file grow bigger then the set limit
function CaptureStdout(callback) {
    var oldWrite = process.stdout.write;
    var fs = require ('fs');
    var captured = false;
    var logFile, oldLogFile;

    var _interface = {
        capture: function (verbose, logDirectory, logName, fileSize){
            if (!captured){
                try {fs.mkdirSync (logDirectory);}
                catch (e) {}
                logFile = logDirectory + '/' + logName + '.log';
                oldLogFile = logFile + '.old';
                process.stdout.write = function(string, encoding, fd) {
                    var size = 0;
                    if (verbose){
                        oldWrite.apply(process.stdout, arguments);
                    }
                    if (logFile){
                        fs.appendFile(logFile, string);
                        try {size = fs.statSync (logFile).size;}
                        catch (e) {}
                        if (size > fileSize){
                            fs.writeFileSync(logFile + '.old', fs.readFileSync(logFile));
                            fs.writeFileSync(logFile, ''); // clear out the log file
                        }
                    }
                };
                captured = true;
            }
        },
        release: function (){
            process.stdout.write = oldWrite;
        }
    };
    return _interface;
}

var capture = CaptureStdout ();

(function (){
    var fs = require ('fs');
    var exec = require('child_process').exec;
    var path = require('path');
    var cluster = require ('cluster');
    var async = require ('async');
    var config = require ('./config');
    var server = require ('./server');
    var configData = config.data;

    /*if (configData.data){
     configData = configData.data;
     config.update ();
     }*/

    var error, pull_error = "";
    var package_json, package_copy, parsed_package, parsed_copy;
    var restart = false;
    var need_restart = false;
    // This an abstraction layer for different cloud services
    // all AWS specific code or other cloud vendor stuff should go in here
    var cloud = require ("./cloud.js");
    var updating_on = false;
    var sudo;
    var instance_data;
    var secure_post;
    var pull_list;
    var homePath;
    var appDir;
    var conditionString = config.conditionString;
    var requestRestart = false;
    var logDirectory;

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
            pull_list = [appDir];
            if (configData.dependencies){
                configData.dependencies.forEach (function (proj){
                    pull_list.push (homePath + "/" + proj + "/");
                });
            }
        }
        function _pull (cb){
            console.log ("Pulling the latest code from remote repository");
            async.eachSeries (pull_list, function (proj, cb){
                // get the latest code
                console.log ("\tPulling " + proj);
                var child = exec ("cd " + proj + " ; " + sudo + "git pull", function (err, std, ster){
                    if (err){
                        console.log ("\t\tError pulling repository. Error" + ster);
                        pull_error += "\t\tError pulling repository. Error" + ster;
                    }
                    else{
                        console.log ("\t\t" + std);
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
                    if (need_restart && restart || requestRestart){
                        if (pull_error){
                            res && res.send('They were errors pulling. Errors:' + pull_error + ', restarting');
                        }
                        else{
                            res && res.send('Pull Successful!, restarting');
                        }
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
                                post (instance.dns, req.body, configData.pullPort, secure_post,
                                    url.format ({pathname:"/pull", query:req.query}));
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
    function checkNodeDependencies (cb, req, res){
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
                        res && res.send ("Upgraded Node, restarting");
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
        if (!configData.local && instance_data.deploy){
            var child = exec("sudo yum -y update", function (err, std, ster){
                console.log ("\nChecking for AWS Updates\n" + std);
                if (err) {cb (ster);}
                else {cb ();}
            });
        }
        else {cb ();}
    }

    function getSymbolicLinks (itemPath){
        var symbolicLinks = [];
        function walkRecursive (itemPath) {
            if (fs.existsSync(itemPath)){
                // if a directory but not a a symbolic link. (Leave those)
                var symbolicLink = fs.lstatSync(itemPath).isSymbolicLink ();
                if (fs.statSync(itemPath).isDirectory()){
                    if (!symbolicLink) {
                        fs.readdirSync(itemPath).forEach(function(childItemName) {
                            walkRecursive (path.join (itemPath, childItemName));
                        });
                    }
                    else {
                        var index = itemPath.lastIndexOf("/");
                        if (index > 0) {index++;}

                        symbolicLinks.push (itemPath.slice (index, itemPath.length));
                    }
                }
            }
        }
        walkRecursive (itemPath);
        return symbolicLinks;
    }


    // check for any node module changes and reinstall the associated packages.
    // NPM doesn't do a good job of keeping track. So keep a copy of the last successful
    // update and compare it. Find ones that have changed and delete them and then
    // re-install.
    function checkNPMDependencies (cb, projPath){

        function deleteRecursiveSync (itemPath){
            function walkRecursive (itemPath) {
                if (fs.existsSync(itemPath)){
                    // if a directory but not a a symbolic link. (Leave those)
                    var symbolicLink = fs.lstatSync(itemPath).isSymbolicLink ();
                    if (fs.statSync(itemPath).isDirectory() && !symbolicLink) {
                        fs.readdirSync(itemPath).forEach(function(childItemName) {
                            walkRecursive (path.join (itemPath, childItemName));
                        });
                        if (!symbolicLink){
                            try {fs.rmdirSync(itemPath);}
                            catch (e){}
                        }
                    } else {
                        fs.unlinkSync(itemPath);
                    }
                }
            }
            walkRecursive (itemPath);
        }

        var _package_json, _parsed_copy, _parsed_package, _package_copy;
        if (!projPath){
            _package_json = package_json;
            _parsed_copy = parsed_copy;
            _parsed_package = parsed_package;
            _package_copy = package_copy;
            projPath = appDir + '/';
        }
        else{
            try { _package_copy = fs.readFileSync (projPath + "package.copy");}
            catch (e) { _package_copy = null;}
            try {_package_json = fs.readFileSync (projPath + "package.json");}
            catch (e) { _package_json = null;}
            _parsed_package = (_package_json) ? JSON.parse (_package_json) : null;
            _parsed_copy = (_package_copy) ? JSON.parse (_package_copy) : null;
        }

        console.log ("\nChecking for Node Module dependency changes for:" + projPath);
        if (!_package_json){
            console.log ("WARNING Your Application has no 'package.json' . It is highly" +
                " recommended that you use one to manage your NPM dependencies");
        }
        else{ // delete the modules that have changed and re-install with new versions
            if (!_package_copy || _package_copy.toString() !== _package_json.toString ()){
                console.log ("\tNPM dependency changes detected");
                if (_parsed_package && _parsed_package.dependencies){
                    for (var package_name in _parsed_package.dependencies){
                        var copy_version = (_parsed_copy && _parsed_copy.dependencies) ? _parsed_copy.dependencies[package_name] : "";
                        if (copy_version !== _parsed_package.dependencies[package_name]){
                            deleteRecursiveSync (projPath + "node_modules/" + package_name);
                        }
                    }
                }
                if (_parsed_copy && _parsed_copy.dependencies){
                    for (package_name in _parsed_copy.dependencies){
                        copy_version = (_parsed_package && _parsed_package.dependencies) ? _parsed_package.dependencies[package_name] : "";
                        if (copy_version !== _parsed_copy.dependencies[package_name]){
                            deleteRecursiveSync (projPath + "node_modules/" + package_name);
                        }
                    }
                }
                console.log ("\tInstalling new Node Modules");
                var cmd_str = (projPath) ? "cd " + projPath + " ; " + sudo + "npm install -d" : sudo + "npm install -d";
                var child = exec (cmd_str, function (err, std, ster){
                    if (err){
                        console.log ("\t\tError installing Node modules. Error:" + ster + " :" + err);
                        pull_error += "\nError installing Node modules. Error:" + ster + " :" + err;
                        fs.writeFileSync (projPath + "package.copy", _package_json);
                    }
                    else{
                        console.log ("\t\tSuccessfully updated Node Modules: " + std);
                        fs.writeFileSync (projPath + "package.copy", _package_json);
                    }
                    cb && cb ();
                });
            }
            else{
                console.log ("\tNo node module changes detected");
                cb && cb ();
            }
        }
    }

    function checkAllNPMDependencies (cb){

        var symbolicLinks = getSymbolicLinks (appDir + "/node_modules/");
        // first check the local ones
        var dependencies = (configData && configData.dependencies) || [];
        console.log ("creating NPM Links");
        async.eachSeries (dependencies, function (proj, cb){
            var cmd_str = " cd " + appDir + " ; " + sudo + " npm unlink " + proj;
            var child = exec (cmd_str, function (err, std, ster){
                if (err){
                    console.log ("\tError unlinking " + proj + " to " + appDir);
                    if (ster) { console.log ("\t\t" + ster); }
                }
                else{
                    console.log ("\tunlinking " + proj + " to " + appDir);
                    if (std) { console.log ("\t\t" + std); }
                }
                // give us a couple seconds before moving onto the next one. Seems to be some issue with
                // not letting a few cycles elapse before trying it again.
                cb ();
            });
        }, function  (){
            console.log ("Unlinking complete");
            checkNPMDependencies (function (){
                // now check the dependencies of any dependent projects
                async.eachSeries (dependencies, function (dependency, done){
                    var projPath = homePath + "/" + dependency + "/";
                    checkNPMDependencies (function (){
                        done ();
                    }, projPath);
                    // other dependency directories are linked in using symbolic links
                    // If we deleted them, add them back in
                }, function createNPMLinks (){
                    console.log ("creating NPM Links");
                    var links = (dependencies && dependencies.length) ? dependencies : symbolicLinks;
                    async.eachSeries (links, function (proj, cb){
                        var cmd_str = " cd " + appDir + " ; " + sudo + " npm link " + proj;
                        var child = exec (cmd_str, function (err, std, ster){
                            if (err){
                                console.log ("\tError linking " + proj + " to " + appDir);
                                if (ster) {console.log ("\t\t" + ster);}
                            }
                            else{
                                console.log ("\tlinking " + proj + " to " + appDir);
                                if (std) {console.log ("\t\t" + std);}
                            }
                            cb ();
                        });
                    }, function  (){
                        console.log ("Linking complete");
                        cb && cb ();
                    });
                });
            });
        });
    }

    function checkAndUpdateEnvironment (_requestRestart, cb, master, req, res){
        requestRestart = _requestRestart;
        if (updating_on || configData.remote === 'n'){
            // get the latest code
            pull (function (){
                // check for dependency changes
                checkAWSDependencies (function (){
                    checkNodeDependencies (function (){
                        checkAllNPMDependencies (function (){
                            cb && cb ();
                        }, req, res);
                    }, req, res);
                }, req, res);
            }, master, req, res);
        }
        else{
            cb && cb ();
        }
    }

    // start the application
    function startApp (){
        // set command line args
        if (configData.commandArguments || configData.pullArgs){
            if (configData.commandArguments){
                var args = configData.commandArguments.split (" ");
                if (cluster.isMaster){ // only output this info once
                    console.log ("Set the following Command Line Arguments:\n\t" + configData.commandArguments);
                }
                args && args.forEach (function (arg){
                    process.argv.push (arg);
                });
            }
        }
        else if (cluster.isMaster) {
            console.log ("No Command Line Arguments set!");
        }


        // set environment variables
        if (configData.appEnvironmentVariables){
            var env_vars;
            try {env_vars = JSON.parse (conditionString(configData.appEnvironmentVariables));}
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
        var workingDirectory = configData.applicationDirectory || process.cwd();
        if (cluster.isMaster && configData.preLaunch){
            console.log ("Processing preLaunch File: " + configData.preLaunch);
            var pre_launch = require (workingDirectory + '/' + configData.preLaunch);
            pre_launch.start (function (){
                _start ();
            });
        }
        else{ // no prelaunch file or not master
            _start ();
        }

        function _start (){
            // enter the application
            var appEntry = configData.appEntry || "start.js", date;
            if (cluster.isMaster){
                date = new Date ();
                console.log ("\n\n********************************************************************************");
                console.log ("\tSTARTING APPLICATION %s", configData.applicationName);
                console.log ("\tCALLING: %s", appEntry);
                console.log ("\t\tDate:" + date.toUTCString ());
                console.log ("********************************************************************************\n\n");
            }
            // actually launch the app!!!
            require (workingDirectory + '/' + appEntry);
            restart = true;
        }
    }



    /////////////////// CODE EXECUTION STARTS HERE ///////////////////////////
    function run (){
        if (cluster.isMaster){
            // capture std out so its logged
            console.log ("********** Node-Deploy Started *********");
            var date = new Date ();
            console.log (date.toString ());
            console.log ("working directory:" + process.cwd ());
        }

        // get the app path and the home path
        appDir = (configData && configData.applicationDirectory) || "";
        homePath  = appDir.slice (0, appDir.lastIndexOf ('/'));
        // if nor configured this does nothing
        sudo = (configData.sudo) ? "sudo " : "";

        // initialize the logger (Keep the log file fixed size by rolling the results over)
        var logger = configData && configData.logger;
        var logSize = (configData && configData.logSize) || 64 * 1024 * 1024; // 64 meg
        if (logger !== false){
            logDirectory = appDir + '/logs';
            capture.capture (true, logDirectory, configData.applicationName, logSize);
        }

        if (cluster.isMaster){
            // init the cloud code
            cloud.init (function (){
                instance_data = cloud.getInstanceData ();
                console.log ("\nGetting Cloud Data")
                console.log ("  Instance ID:" + cloud.getInstanceId ());
                console.log ("  Instance Data:%j", instance_data);

                // see if updating should be on or off
                if (instance_data && instance_data.deploy === true){
                    updating_on = true;
                }

                // change directory to the app working directory. Default to the current directory
                var workingDirectory = configData.applicationDirectory || process.cwd();
                console.log ("\nWorking Directory is:" + process.cwd());
                process.chdir (workingDirectory);
                console.log ("Setting Working Directory to:" + process.cwd());

                // determine if we are in the could or not and set an environment variable
                // in case other code needs to know this
                console.log ("\nServer in cloud: " + cloud.isCloud ());
                process.env['CLOUD'] = cloud.isCloud ();
                process.env['INSTANCE_ID'] = cloud.getInstanceId ();
                process.env['INSTANCE_DATA'] = JSON.stringify (cloud.getInstanceData ());

                checkAndUpdateEnvironment (false, function (){
                    //if (updating_on){
                    server.startServer (instance_data, checkAndUpdateEnvironment, function (){
                        startApp ();
                    });
                }, false);
            });
        }
        else{
            startApp ();
        }
    }
    run ();
})();
