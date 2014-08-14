
var fs = require('fs');
var exec = require ('child_process').exec;
var async = require ("async");
var app_path, ssh_file, local, email;
var i = 0;
var prompt = require ("prompt");
var config = {}, config_file, local;
var home_path = require.resolve ("./install.js").replace ("node-aws-deploy/install.js", "");
var config = require ("./config");
var configData = config.data;
var conditionString = config.conditionString;

async.waterfall ([

    function (done){
        // Installs the whole setup
        console.log ("\n\nWELCOME TO THE NODE-AWS-DEPLOY INSTALLER");
        console.log ("This installs your application onto AWS and allows automatic deployment just by pushing to your remote git repository." +
            " Just answer a few questions and everything will be setup");
        prompt.start ();
        done ();
    },

    function (done){
        console.log (++i + ") Is this a 'remote' install? (If this is on a remote server the answer is y) (y/n)");
        if (configData.applicationDirectory) {console.log ("Current Value = " + configData.remote + " (Press <enter> to keep)");}
        prompt.get (['(y/n)'], function (err, results){
            configData.remote = (results['(y/n)'] || configData.remote || 'n');
            local = (configData.remote === 'n');
            configData.sudo = (local) ? "" : "sudo";
            config.update ();
            done ();
        });
    },

    function (done){
        if (!local){
            console.log (++i + ") Would you like the application to check and get the latest AWS updates on every pull? (sudo yum update)");
            if (configData.awsUpdates) {console.log ("Current Value = " + configData.awsUpdates + " (Press <enter> to keep)");}
            prompt.get (['(y/n)'], function (err, results){
                configData.awsUpdates = (results['(y/n)'] || configData.awsUpdates || 'n');
                config.update ();
                done ();
            });
        }
        else{
            done ();
        }
    },

    function (done){
        if (!local){
            console.log (++i + ") Would you like the application to pull the latest code on restart? (true/false)");
            if (configData.noPullOnRestart) {console.log ("Current Value = " + configData.noPullOnRestart + " (Press <enter> to keep)");}
            prompt.get (['(true/false)'], function (err, results){
                configData.noPullOnRestart = (results['(true/false)'] || configData.noPullOnRestart || 'true');
                config.update ();
                done ();
            });
        }
        else{
            done ();
        }
    },

    function (done){
        if (!local){
            console.log (++i + ") Would you like to use the node-aws-deploy logger (default = true)");
            if (configData.logger) {console.log ("Current Value = " + (configData.logger) + " (Press <enter> to keep)");}
            prompt.get (['(true/false)'], function (err, results){
                configData.logger = (results['(true/false)'] || configData.logger || true);
                config.update ();
                done ();
            });
        }
        else{
            done ();
        }
    },

    function (done){
        if (!local && configData.logger){
            console.log (++i + ") Enter a size for the log file in bytes (default is 64MB)");
            if (configData.logSize) {console.log ("Current Value = " + (configData.logSize) + " (Press <enter> to keep)");}
            prompt.get (['size'], function (err, results){
                configData.logSize = (results['size'] || configData.logSize || 64 * 1024 * 1024);
                config.update ();
                done ();
            });
        }
        else{
            done ();
        }
    },

    function (done){
        if (local){
            console.log (++i + ") Enter your desired application's full path. (no file names. Example  '/User/me/MyCoolApplication')");
            if (configData.applicationDirectory) {console.log ("Current Value = " + configData.applicationDirectory + " (Press <enter> to keep)");}
            prompt.get (['folder'], function (err, results){
                if (results['folder']){
                    configData.applicationDirectory = results['folder'];
                    var end = configData.applicationDirectory.lastIndexOf ('/');
                    configData.applicationPath = configData.applicationDirectory.substr (0, end + 1);
                    config.update ();
                }
                done ();
            });
        }
        else{
            done ();
        }
    },

    function (done){
        console.log (++i + ") Enter your application's name");
        if (configData.applicationName) {console.log ("Current Value = " + configData.applicationName + " (Press <enter> to keep)");}
        prompt.get (['name'], function (err, results){
            if (results['name']){
                configData.applicationName = results['name'];
                config.update ();
            }
            done ();
        });
    },

    function (done){
        console.log (++i + ") Enter your application's url (internet address not localhost)");
        if (configData.appURL) {console.log ("Current Value = " + configData.appURL + " (Press <enter> to keep)");}
        prompt.get (['url'], function (err, results){
            if (results['url']){
                configData.appURL = results['url'];
                config.update ();
            }
            done ();
        });
    },

    function (done){
        console.log (++i + ") Enter any command line arguments you would like passed in (Entered as you would on the command line)");
        if (configData.commandArguments) {console.log ("Current Value = " + configData.commandArguments + " (Press <enter> to keep)");}
        prompt.get (['arguments'], function (err, results){
            if ( results['arguments']){
                configData.commandArguments = results['arguments'];
                config.update ();
            }
            done ();
        });
    },

    function (done){
        console.log (++i + ') Enter any environment variables you would like set when your application is run (Entered as a JSON. Example: {"APP_ENV":"production"}');
        if (configData.appEnvironmentVariables) {console.log ("Current Value = " + configData.appEnvironmentVariables + " (Press <enter> to keep)");}
        prompt.get (['environment variables'], function (err, results){
            if (results['environment variables']){
                configData.appEnvironmentVariables = results['environment variables'];
                config.update ();
            }
            done ();
        });
    },

    function (done){
        console.log (++i + ") Enter your application's entry point (defaults to 'start.js'). The file name is relative to your application folder");
        if (configData.appEntry) {console.log ("Current Value = " + configData.appEntry + " (Press <enter> to keep)");}
        prompt.get (['entry point'], function(err, results) {
            results['entry point'] = results['entry point'] || configData.appEntry || "start.js";
            if (results['entry point']){
                configData.appEntry = results['entry point'];
                config.update ();
            }
            done ();
        });
    },

    function (done){
        console.log (++i + ") Enter a javascript file that you want executed prior to launching the application (optional). The file name is relative to your application folder");
        if (configData.preLaunch) {console.log ("Current Value = " + configData.preLaunch + " (Press <enter> to keep)");}
        prompt.get (['pre-launch'], function(err, results) {
            results['pre-launch'] = results['pre-launch'];
            if (results['pre-launch']){
                configData.preLaunch = results['pre-launch'];
                config.update ();
            }
            done ();
        });
    },

    function (done){
        if (local){
            console.log ("Please take a second ensure you are set up to clone your repository. This might require you to create an ssh key pair or simply use credentials.");
            console.log ("When you have your repository cloned press <enter> to continue.");
            prompt.get (['<enter>'], function(err, results) {
                done ();
            });
        }
        else{
            done ();
        }
    },

    function (done){
        if (!local){
            // go get the ssh key
            try { ssh_file = fs.readFileSync ("/root/.ssh/id_rsa.pub");}
            catch (err) {ssh_file = null;}
            if (!ssh_file){
                done ("/tssh key not generated, please exit generate one, and re-run");
            }
            else{
                done ();
            }
        }
        else{
            done ();
        }
    },

    function (done){
        if (!local){
            console.log(++i + ") Please take a second to copy the ssh key from this server, listed below, and paste into your git repository service (such as github). This will authorize this server AMI to " +
                "clone your repository and perform git pulls. Press <enter> when done.");
            console.log ("\n" + ssh_file + "\n");
            prompt.get (['<enter>'], function(err, results) {
                done ();
            });
        }
        else{
            done ();
        }
    },

    function (done){
        if (!local){
            console.log (++i + ") Enter the pull information, what triggers it how its configured, etc...");
            console.log ("\t pullPort: <set this to the port for a pull requests> - defaults to 8000");
            if (configData.pullPort) {console.log ("\t\tCurrent Value = " + configData.pullPort + " (Press <enter> to keep)");}
            console.log ("\t pullKey: <path to a ssh key file for the HTTPS Server. It must be the full path>");
            if (configData.pullKey) {console.log ("\t\tCurrent Value = " + configData.pullKey + " (Press <enter> to keep)");}
            console.log ("\t pullCert: <path to a ssh cert file for the HTTPS Server. It must be the full path>");
            if (configData.pullCert) {console.log ("\t\tCurrent Value = " + configData.pullCert + " (Press <enter> to keep)");}
            console.log ("\t pullCa: <array of paths to the certificate authority files. It must be the full path (['/home/ec2-user/...', ...])> (optional)");
            if (configData.pullCa) {console.log ("\t\tCurrent Value = " + configData.Ca + " (Press <enter> to keep)");}
            console.log ("\t pullPassphrase: <string - phrase that the certificate was generated with> (optional)");
            if (configData.pullPassphrase) {console.log ("\t\tCurrent Value = " + configData.pullPassphrase + " (Press <enter> to keep)");}
            console.log ("\t pullSecret: <secret phrase that this server uses to identify as a valid pull request> (optional))");
            if (configData.pullSecret) {console.log ("\t\tCurrent Value = " + configData.pullSecret + " (Press <enter> to keep)");}
            console.log ("\t pullBranch: <the branch that this server should pull from on pull requests> (defaults to master))");
            if (configData.pullBranch) {console.log ("\t\tCurrent Value = " + configData.pullBranch + " (Press <enter> to keep)");}
            console.log ("\t pullField: <the field that contains the branch info in the webhook post requests> (defaults to 'ref'))");
            if (configData.pullField) {console.log ("\t\tCurrent Value = " + configData.pullField + " (Press <enter> to keep)");}
            else {configData.pullField = 'ref';}
            if (configData.appEnvironmentVariables) {console.log ("Current Value = " + configData.appEnvironmentVariables + " (Press <enter> to keep)");}
            prompt.get (["pullPort", "pullKey", "pullCert", "pullCa", "pullPassphrase", "pullSecret", "pullBranch", "pullField"], function (err, results){
                for (var k in results){
                    configData[k] = results[k] || config[k];
                }
                config.update ();
                done ();
            });

        }
        else{
            done ();
        }
    },

    function (done){
        if (local){
            console.log (++i + ") Enter the pull information... (used to manually send a webhook)");
            console.log ("\t pullPort: <set this to the port for a pull requests> - defaults to 8000");
            if (configData.pullPort) {console.log ("\t\tCurrent Value = " + configData.pullPort + " (Press <enter> to keep)");}
            console.log ("\t pullSecret: <secret phrase that this server uses to identify as a valid pull request> (optional))");
            if (configData.pullSecret) {console.log ("\t\tCurrent Value = " + configData.pullSecret + " (Press <enter> to keep)");}
            console.log ("\t pullBranch: <the branch that this server should pull from on pull requests> (defaults to master))");
            if (configData.pullBranch) {console.log ("\t\tCurrent Value = " + configData.pullBranch + " (Press <enter> to keep)");}
            console.log ("\t pullField: <the field that contains the branch info in the webhook post requests> (defaults to 'ref'))");
            if (configData.pullField) {console.log ("\t\tCurrent Value = " + configData.pullField + " (Press <enter> to keep)");}
            else {configData.pullField = 'ref';}
            if (configData.appEnvironmentVariables) {console.log ("Current Value = " + configData.appEnvironmentVariables + " (Press <enter> to keep)");}
            prompt.get (["pullPort", "pullSecret", "pullBranch", "pullField"], function (err, results){
                for (var k in results){
                    configData[k] = results[k] || config[k];
                }
                config.update ();
                done ();
            });

        }
        else{
            done ();
        }
    },

    function (done) {
        if (true){
            console.log (++i + ") Enter AWS SDK Information so that this server can talk to others on a pull request");
            console.log ("\t accessKeyId: <AWS API Access key 'XXXXXXXXXXXXXXXXXXXX'>");
            if (configData.accessKeyId) {console.log ("\t\tCurrent Value = " + configData.accessKeyId + " (Press <enter> to keep)");}
            console.log ("\t secretAccessKey: <AWS Secret Access key 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'>");
            if (configData.secretAccessKey) {console.log ("\t\tCurrent Value = " + configData.secretAccessKey + " (Press <enter> to keep)");}
            console.log ("\t region: <aws region that the servers are located in. EX 'us-east-1'>");
            if (configData.region) {console.log ("\t\tCurrent Value = " + configData.region + " (Press <enter> to keep)");}
            prompt.get (["accessKeyId", "secretAccessKey", "region"], function (err, results){
                for (var k in results){
                    configData[k] = results[k] || config[k];
                }
                config.update ();
                done ();
            });

        }
        else{
            done ();
        }
    },

    function (done){
        if (!local){
            console.log (++i + ") Now that your Git repository has been configured, enter the ssh url for remote access so this server can clone it (Press Enter to skip):");
            prompt.get (['Git repository URL'], function (err, results){
                var git_url = results['Git repository URL'];
                if (git_url){
                    console.log ("  Cloning your repository...");
                    var child = exec ('cd ' + configData.applicationDirectory + ' ; cd .. ; ' + configData.sudo + ' git clone ' + git_url, function (err, std, ster){
                        if (err){
                            done (err);
                        }
                        else{
                            console.log (std);
                            var dir = std.split ("Cloning into ");
                            // extract the directory from the git clone string
                            dir = dir && dir[1] && dir[1].split ("'")[1].replace ("...", "");
                            if (dir){
                                configData.applicationDirectory = home_path + dir;
                            }
                            console.log ("Configuring the branch and pulling all dependencies....");
                            var cmdString = 'cd ' + configData.applicationDirectory + ' ; ' + configData.sudo + ' git checkout ' + configData.pullBranch +
                                ' ; ' + configData.sudo + ' npm install -d ; sudo mkdir logs ; sudo chmod 755 logs';
                            console.log("command string = " +cmdString);
                            child = exec (cmdString, function (err, std, ster){
                                console.log (std);
                                done ();
                            });
                        }
                    });
                }
                else{
                    done ();
                }
            });
        }
        else{
            done ();
        }
    },

    function (done){
        if (true){
            console.log (++i + ') If there are any dependencies in your package.json file that need to be pulled on startup, enter them now. Example: ["project1", "project2"]');
            if (configData.dependencies) {console.log ("\t\tCurrent Value = " + configData.dependencies + " (Press <enter> to keep)");}
            prompt.get (['Dependencies'], function (err, results){
                var _dependencies = results['Dependencies'];
                if (_dependencies){
                    var dependencies;
                    try{dependencies = JSON.parse (conditionString (_dependencies));}
                    catch (e) {console.log ("Error parsing dependencies: " + e);}
                    configData.dependencies = dependencies;
                    config.update ();
                    if (!local){
                        // grab the package.json file so we can look up these dependencies
                        var package_json;
                        try { package_json = require (configData.applicationDirectory + "/package.json");}
                        catch (e) {console.log ("Unable to find the applications package.json. Error:" + e);}
                        if (package_json){

                            if (!configData.applicationPath){
                                var end = configData.applicationDirectory.lastIndexOf ('/');
                                configData.applicationPath = configData.applicationDirectory.substr (0, end + 1);
                                config.update ();
                            }

                            // clone and npm link the projects the projects
                            // go through each project, clone it outside the main project, and npm link it to the project
                            async.eachSeries (dependencies, function (proj, cb){
                                // get the repository
                                var repo = package_json.dependencies[proj];
                                if (repo){
                                    // reformat the repositories so git understands them
                                    repo = repo.replace ("git://", "https://").replace ("git+ssh://", "");
                                    console.log ("Cloning " + proj + " @ " + repo + " into " +  configData.applicationPath + proj);
                                    var cmdString = " cd " + configData.applicationPath + " ; sudo git clone " + repo + " ; cd "
                                        +  configData.applicationPath + "/" + proj +" ; " + configData.sudo + ' git checkout ' + configData.pullBranch +" ;  sudo npm link ";
                                    console.log("command string = " +cmdString);
                                    var child = exec (cmdString, function (err, std, ster){
                                        if (err){
                                            console.log ("\tError cloning. Error:" + ster);
                                            cb ();
                                        }
                                        else{
                                            console.log ("\tClone Successful!");
                                            cb ();
                                        }
                                    });
                                }
                                else{
                                    console.log ("Invalid repository. Project: " + proj + ". Repository: " + repo + ".");
                                    cb ();
                                }

                            }, function (){
                                // link all of these projects with the main project
                                async.eachSeries (dependencies, function (proj, cb){
                                    var cmd_str = " cd " + configData.applicationDirectory + " ; sudo npm link " + proj;
                                    var child = exec (cmd_str, function (err, std, ster){
                                        if (err){
                                            console.log ("Error linking " + proj + " to " + configData.applicationDirectory);
                                            console.log ("\t" + ster);
                                        }
                                        else{
                                            console.log ("linking " + proj + " to " + configData.applicationDirectory);
                                            console.log ("\t" + std);
                                        }
                                        // give us a couple seconds before moving onto the next one. Seems to be some issue with
                                        // not letting a few cycles elapse before trying it again.
                                        cb ();
                                    });
                                }, function  (){
                                    console.log ("Cloning and Linking complete");
                                    done ();
                                });
                            });
                        }
                        else {done ();}
                    }
                    else {done ();}
                }
                else {done ();}
            });
        }
        else {done ();}
    }

], function (err){
    if (!err){
        config.update ();
        console.log ("Successfully installed: " + configData.applicationName + ". The Configuration has been written out to '.app-config.json' in ~/node-aws-deploy, " +
            "The settings can always be changed by manually editing the '.app-config.json' file.");
        if (!local){
            console.log ("To Launch the application type 'sudo start " + (configData.applicationName || "node-aws-deploy") + "'");
            // rename the upstart file to the application name
            if (configData.applicationName){
                var name = configData.applicationName + ".conf";
                var child = exec ("sudo mv /etc/init/node-aws-deploy.conf /etc/init/" + name, function (err, std, ster){
                    var data = fs.readFileSync ('/etc/init/' + name);
                    var data_str = data && data.toString ();
                    if (data_str && data_str.replace){
                        data_str = data_str && data_str.replace ('PLACE_HOLDER', configData.applicationDirectory);
                        fs.writeFileSync ('/etc/init/' + name, data_str);
                    }
                    process.exit (0);
                });
            }
            else{
                process.exit (0);
            }
        }
        else{
            process.exit (0);
        }
    }
    else{
        console.log ("There were errors. Errors:" + err);
        process.exit (1);
    }
});





