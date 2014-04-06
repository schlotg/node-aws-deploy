
var fs = require('fs');
var exec = require ('child_process').exec;
var async = require ("async");
var app_path, ssh_file, local, email;
var i = 0;
var prompt = require ("prompt");
var config = {};

async.waterfall ([


    function (done){
        // Installs the whole setup
        console.log ("\n\nWELCOME TO THE NODE-AWS-DEPLOY INSTALLER");
        console.log ("This installs your application onto AWS and allows automatic deployment just by pushing to your remote git repository." +
            " Just answer a few questions and everything will be setup");
        prompt.start ();
        done ();
    }/*,

    function (done){
        console.log (++i + ") Is this a 'remote' install? (If this is on a remote server the answer is y)");
        prompt.get (['(y/n)'], function (err, results){
            var answer = (results['(y/n)'] === 'y');
            local = !answer;
            config.sudo = (local) ? "" : "sudo";
            done ();
        });
    },

    function (done){
        if (local){
            console.log (++i + ") Enter your desired application's full path. (no file names. Example  '/User/me/MyCoolApplication')");
            prompt.get (['folder'], function (err, results){
                config.applicationDirectory = results['folder'];
                done ();
            });
        }
        else{
            done ();
        }
    },

    function (done){
        console.log (++i + ") Enter your application's name");
        prompt.get (['name'], function (err, results){
            config.applicationName = results['name'];
            done ();
        });
    },

    function (done){
        console.log (++i + ") Enter your application's entry point (defaults to 'start.js')");
        prompt.get (['entry point'], function(err, results) {
            config.appEntry = results['entry point'];
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
            console.log (++i + ") Now that your Git repository has been configured, enter the ssh url for remote access so this server can clone it:");
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
                                config.applicationDirectory = '/home/ec2-user/' + dir;
                            }
                            done ();
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
            console.log (++i + ") Enter the pull information, what triggers it how its configured, etc...");
            console.log ("\t pullPort: <set this to the port for a pull requests> - defaults to 8000");
            console.log ("\t pullKey: <path to a ssh key file for the HTTPS Server>");
            console.log ("\t pullCert: <path to a ssh cert file for the HTTPS Server>");
            console.log ("\t pullCa: <array of paths to the certificate authority files> (optional)");
            console.log ("\t pullPassphrase: <string - phrase that the certificate was generated with> (optional)");
            console.log ("\t pullSecret: <secret phrase that this server uses to identify as a valid pull request> (optional))");
            console.log ("\t pullBranch: <the branch that this server should pull from on pull requests> (defaults to master))");
            prompt.get (["pullPort", "pullKey", "pullCert", "pullCa", "pullPassphrase", "pullSecret", "pullBranch"], function (err, results){
                for (var k in results){
                    config[k] = results[k];
                }
                done ();
            });

        }
        else{
            done ();
        }
    },
    function (done) {
        if (!local){
            console.log (++i + ") Enter AWS SDK Information so that this server can talk to others on a pull request");
            console.log ("\t accessKeyId: <AWS API Access key 'XXXXXXXXXXXXXXXXXXXX'>");
            console.log ("\t secretAccessKey: <AWS Secret Access key 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'>");
            console.log ("\t region: <aws region that the servers are located in. EX 'us-east-1'>");
            prompt.get (["accessKeyId", "secretAccessKey", "region"], function (err, results){
                for (var k in results){
                    config[k] = results[k];
                }
                done ();
            });

        }
        else{
            done ();
        }
    }*/

], function (err){
    if (!err){
config.applicationDirectory = "/home/ec2-user/ABoxAbove";
config.applicationName = "aba";
        var data = JSON.stringify (config);
        fs.writeFileSync (config.applicationDirectory + "/.app-config.json", data);
        console.log ("Success installed: " + config.applicationName + ". The Configuration has been written out to app-config.json");
        if (!local){
            console.log ("To Launch the application type 'sudo start " + (config.applicationName || "node-aws-deploy") + "'");
            // rename the upstart file to the applicaiton name
            if (config.applicationName){
                var name = config.applicationName + ".conf";
console.log (name);
                var child = exec ("sudo mv /etc/init/node-aws-deploy.conf /etc/init/" + name, function (err, std, ster){
                    var data = fs.readFileSync ('/etc/init/' + name);
console.log (data);

                    var data_str = data && data.toString ();
                    if (data_str && data_str.replace){
                        data_str && data_str.replace ('PLACE_HOLDER', config.applicationDirectory);
console.log (data_str);
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






