
var fs = require('fs');
var exec = require ('child_process').exec;
var async = require ("async");
var app_path, ssh_file, local, email;
var i = 0;
var prompt = require ("prompt");
var config = {}, config_file, local;
var home_path = require.resolve ("./install.js")).replace ("node-aws-deploy/install.js", "");


// renove non-standard quotation marks and replace them with the standard ones
function conditionString (str){
    var open = String.fromCharCode(147);
    var close = String.fromCharCode(148);
    return str && str.replace(open,'"').replace(close,'"');
}

function updateConfig (){
    if (config){
        var data = JSON.stringify (config, null, 4);
        fs.writeFileSync (".app-config.json", conditionString (data));
    }
}

async.waterfall ([

    function (done){
        try {config_file = fs.readFileSync (".app-config.json");}
        catch (err){ error = err;}

        if (config_file){
            try {config = JSON.parse (config_file);}
            catch (err){ error = err;}
        }
        done ();
    },

    function (done){
        // Installs the whole setup
        console.log ("\n\nWELCOME TO THE NODE-AWS-DEPLOY INSTALLER");
        console.log ("This installs your application onto AWS and allows automatic deployment just by pushing to your remote git repository." +
            " Just answer a few questions and everything will be setup");
        prompt.start ();
        done ();
    },

    function (done){
        console.log (++i + ") Is this a 'remote' install? (If this is on a remote server the answer is y)");
        if (config.applicationDirectory) {console.log ("Current Value = " + config.remote + " (Press <enter> to keep)");}
        prompt.get (['(y/n)'], function (err, results){
            config.remote = (results['(y/n)'] || config.remote || 'n');
            local = (config.remote === 'n');
            config.sudo = (local) ? "" : "sudo";
            updateConfig ();
            done ();
        });
    },

    function (done){
        if (local){
            console.log (++i + ") Enter your desired application's full path. (no file names. Example  '/User/me/MyCoolApplication')");
            if (config.applicationDirectory) {console.log ("Current Value = " + config.applicationDirectory + " (Press <enter> to keep)");}
            prompt.get (['folder'], function (err, results){
                if (results['folder']){
                    config.applicationDirectory = results['folder'];
                    var end = config.applicationDirectory.lastIndexOf ('/');
                    config.applicationPath = config.applicationDirectory.substr (0, end + 1);
                    updateConfig ();
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
        if (config.applicationName) {console.log ("Current Value = " + config.applicationName + " (Press <enter> to keep)");}
        prompt.get (['name'], function (err, results){
            if (results['name']){
                config.applicationName = results['name'];
                updateConfig ();
            }
            done ();
        });
    },

    function (done){
        console.log (++i + ") Enter your application's url (internet address not localhost)");
        if (config.appURL) {console.log ("Current Value = " + config.appURL + " (Press <enter> to keep)");}
        prompt.get (['url'], function (err, results){
            if (results['url']){
                config.appURL = results['url'];
                updateConfig ();
            }
            done ();
        });
    },

    function (done){
        console.log (++i + ") Enter any command line arguments you would like passed in (Entered as you would on the command line)");
        if (config.commandArguments) {console.log ("Current Value = " + config.commandArguments + " (Press <enter> to keep)");}
        prompt.get (['arguments'], function (err, results){
            if ( results['arguments']){
                config.commandArguments = results['arguments'];
                updateConfig ();
            }
            done ();
        });
    },

    function (done){
        console.log (++i + ') Enter any environment variables you would like set when your application is run (Entered as a JSON. Example: {"APP_ENV":"production"}');
        if (config.appEnvironmentVariables) {console.log ("Current Value = " + config.appEnvironmentVariables + " (Press <enter> to keep)");}
        prompt.get (['environment variables'], function (err, results){
            if (results['environment variables']){
                config.appEnvironmentVariables = results['environment variables'];
                updateConfig ();
            }
            done ();
        });
    },

    function (done){
        console.log (++i + ") Enter your application's entry point (defaults to 'start.js'). The file name is relative to your application folder");
        if (config.appEntry) {console.log ("Current Value = " + config.appEntry + " (Press <enter> to keep)");}
        prompt.get (['entry point'], function(err, results) {
            results['entry point'] = results['entry point'] || "start.js";
            if (results['entry point']){
                config.appEntry = results['entry point'];
                updateConfig ();
            }
            done ();
        });
    },

    function (done){
        console.log (++i + ") Enter a javascript file that you want executed prior to launching the application (optional). The file name is relative to your application folder");
        if (config.preLaunch) {console.log ("Current Value = " + config.preLaunch + " (Press <enter> to keep)");}
        prompt.get (['pre-launch'], function(err, results) {
            results['pre-launch'] = results['pre-launch'];
            if (results['pre-launch']){
                config.preLaunch = results['pre-launch'];
                updateConfig ();
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
            if (config.pullPort) {console.log ("\t\tCurrent Value = " + config.pullPort + " (Press <enter> to keep)");}
            console.log ("\t pullKey: <path to a ssh key file for the HTTPS Server. It must be the full path>");
            if (config.pullKey) {console.log ("\t\tCurrent Value = " + config.pullKey + " (Press <enter> to keep)");}
            console.log ("\t pullCert: <path to a ssh cert file for the HTTPS Server. It must be the full path>");
            if (config.pullCert) {console.log ("\t\tCurrent Value = " + config.pullCert + " (Press <enter> to keep)");}
            console.log ("\t pullCa: <array of paths to the certificate authority files. It must be the full path (['/home/ec2-user/...', ...])> (optional)");
            if (config.pullCa) {console.log ("\t\tCurrent Value = " + config.Ca + " (Press <enter> to keep)");}
            console.log ("\t pullPassphrase: <string - phrase that the certificate was generated with> (optional)");
            if (config.pullPassphrase) {console.log ("\t\tCurrent Value = " + config.pullPassphrase + " (Press <enter> to keep)");}
            console.log ("\t pullSecret: <secret phrase that this server uses to identify as a valid pull request> (optional))");
            if (config.pullSecret) {console.log ("\t\tCurrent Value = " + config.pullSecret + " (Press <enter> to keep)");}
            console.log ("\t pullBranch: <the branch that this server should pull from on pull requests> (defaults to master))");
            if (config.pullBranch) {console.log ("\t\tCurrent Value = " + config.pullBranch + " (Press <enter> to keep)");}
            console.log ("\t pullField: <the field that contains the branch info in the webhook post requests> (defaults to 'ref'))");
            if (config.pullField) {console.log ("\t\tCurrent Value = " + config.pullField + " (Press <enter> to keep)");}
            else {config.pullField = 'ref';}
            if (config.appEnvironmentVariables) {console.log ("Current Value = " + config.appEnvironmentVariables + " (Press <enter> to keep)");}
            prompt.get (["pullPort", "pullKey", "pullCert", "pullCa", "pullPassphrase", "pullSecret", "pullBranch", "pullField"], function (err, results){
                for (var k in results){
                    config[k] = results[k] || config[k];
                }
                updateConfig ();
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
            if (config.pullPort) {console.log ("\t\tCurrent Value = " + config.pullPort + " (Press <enter> to keep)");}
            console.log ("\t pullSecret: <secret phrase that this server uses to identify as a valid pull request> (optional))");
            if (config.pullSecret) {console.log ("\t\tCurrent Value = " + config.pullSecret + " (Press <enter> to keep)");}
            console.log ("\t pullBranch: <the branch that this server should pull from on pull requests> (defaults to master))");
            if (config.pullBranch) {console.log ("\t\tCurrent Value = " + config.pullBranch + " (Press <enter> to keep)");}
            console.log ("\t pullField: <the field that contains the branch info in the webhook post requests> (defaults to 'ref'))");
            if (config.pullField) {console.log ("\t\tCurrent Value = " + config.pullField + " (Press <enter> to keep)");}
            else {config.pullField = 'ref';}
            if (config.appEnvironmentVariables) {console.log ("Current Value = " + config.appEnvironmentVariables + " (Press <enter> to keep)");}
            prompt.get (["pullPort", "pullSecret", "pullBranch", "pullField"], function (err, results){
                for (var k in results){
                    config[k] = results[k] || config[k];
                }
                updateConfig ();
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
            if (config.accessKeyId) {console.log ("\t\tCurrent Value = " + config.accessKeyId + " (Press <enter> to keep)");}
            console.log ("\t secretAccessKey: <AWS Secret Access key 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'>");
            if (config.secretAccessKey) {console.log ("\t\tCurrent Value = " + config.secretAccessKey + " (Press <enter> to keep)");}
            console.log ("\t region: <aws region that the servers are located in. EX 'us-east-1'>");
            if (config.region) {console.log ("\t\tCurrent Value = " + config.region + " (Press <enter> to keep)");}
            prompt.get (["accessKeyId", "secretAccessKey", "region"], function (err, results){
                for (var k in results){
                    config[k] = results[k] || config[k];
                }
                updateConfig ();
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
                    var child = exec ('cd ' + config.applicationDirectory + ' ; cd .. ; ' + config.sudo + ' git clone ' + git_url, function (err, std, ster){
                        if (err){
                            done (err);
                        }
                        else{
                            console.log (std);
                            var dir = std.split ("Cloning into ");
                            // extract the directory from the git clone string
                            dir = dir && dir[1] && dir[1].split ("'")[1].replace ("...", "");
                            if (dir){
                                config.applicationDirectory = home_path + dir;
                            }
                            console.log ("Configuring the branch and pulling all dependencies....");
                            child = exec ('cd ' + config.applicationDirectory + ' ; ' + config.sudo + ' git checkout ' + config.pullBranch +
                                ' ; ' + config.sudo + ' npm install -d ; sudo mkdir logs ; sudo chmod 755 logs', function (err, std, ster){
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
        if (!local){
            console.log (++i + ') If there are any dependencies in your package.json file that need to be pulled on startup, enter them now. Example: ["project1", "project2"] (Press Enter to skip)');
            prompt.get (['Dependencies'], function (err, results){
                var dependencies = results['Dependencies'];
                if (dependencies){
                    try{dependencies = JSON.parse (conditionString (dependencies));}
                    catch (e) {console.log ("Error parsing dependencies: " + e);}
                    config.dependencies = dependencies;
                    updateConfig ();

                    // grab the package.json file so we can look up these dependencies
                    var package_json;
                    try { package_json = require (config.applicationDirectory + "/package.json");}
                    catch (e) {console.log ("Unable to find the applications package.json. Error:" + e);}
                    if (package_json){

                        // clone and npm link the projects the projects
                        // go through each project, clone it outside the main project, and npm link it to the project
                        async.each (dependencies, function (proj, cb){
                            // get the repository
                            var repo = package_json.dependencies[proj];
                            if (repo){
                                var child = exec (" cd " + config.applicationPath + " ; sudo git clone " + repo + " ; cd " +  config.applicationPath + "/" + proj + " ; sudo npm link ", function (err, std, ster){
                                    if (err){
                                        console.log ("Error cloning " + proj + " @ " + repo + " into " +  config.applicationPath + proj + ". Error:" + ster);
                                        cb ();
                                    }
                                    else{
                                        console.log ("Cloning " + proj + " @ " + repo + " into " +  config.applicationPath + proj);
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
                            var first = true;
                            async.each (dependencies, function (proj, cb){
                                var cmd_str = (first) ? " cd " + config.applicationDirectory + " ; sudo npm link " + proj :
                                    "sudo npm link " + proj;
                                first = false;
                                var child = exec (cmd_str, function (err, std, ster){
                                    if (err){
                                        console.log ("Error linking " + proj + " to " + config.applicationDirectory);
                                    }
                                    else{
                                        console.log ("linking " + proj + " to " + config.applicationDirectory);
                                    }
                                    cb ();
                                });
                            }, function  (){
                                console.log ("Cloning and Linking complete");
                            });
                        });
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
        updateConfig ();
        console.log ("Successfully installed: " + config.applicationName + ". The Configuration has been written out to '.app-config.json' in ~/node-aws-deploy, " +
            "The settings can always be changed by manually editing the '.app-config.json' file.");
        if (!local){
            console.log ("To Launch the application type 'sudo start " + (config.applicationName || "node-aws-deploy") + "'");
            // rename the upstart file to the application name
            if (config.applicationName){
                var name = config.applicationName + ".conf";
                var child = exec ("sudo mv /etc/init/node-aws-deploy.conf /etc/init/" + name, function (err, std, ster){
                    var data = fs.readFileSync ('/etc/init/' + name);
                    var data_str = data && data.toString ();
                    if (data_str && data_str.replace){
                        data_str = data_str && data_str.replace ('PLACE_HOLDER', config.applicationDirectory);
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






