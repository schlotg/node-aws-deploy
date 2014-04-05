
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
    },

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
        console.log (++i + ") Enter your desired application's full path. (no file names. Example  '/home/ec2-user//MyCoolApplication')");
        prompt.get (['folder'], function (err, results){
            var answer = results['folder'];
            config.applicationDirectory = answer;
            try{
                fs.mkdir (answer, function (err){
                    app_path = answer;
                    done ();
                });
            }
            catch (err){
                done ();
            }
        });
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
            console.log (++i + ") Enter your email address to seed the ssh key");
            prompt.get (['email'], function(err, results) {
                email = results['email'];
                done ();
            });
        }
        else{
            done ();
        }
    },

    function (done){
        if (!local){
            // go get the ssh key or create one if it doesn't exist
            try { ssh_file = fs.readFileSync ("/home/ec2-user/.ssh/id_rsa.pub");}
            catch (err) {ssh_file = null; console.log (err);}
            if (!ssh_file){
                console.log ("/tssh key not generated, generating a new one.");
console.log ('ssh-keygen -t rsa -C "' + email + '"');
                var child = exec ('echo HELLO', function (err, std, ster){
console.log ("debug here: err:%j, std:%j, ster:%j", err, std, ster);
                    if (err){done (err);}
                    else{
                        ssh_file = fs.readFileSync ("/home/ec2-user/.ssh/id_rsa.pub");
                        done ();
                    }
                });
            }
            else{
                console.log ("/tssh key already generated!");
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
    }

], function (err){
    if (!err){
        var data = JSON.stringify (config);
        fs.writeFileSync ("app-config.json", data);
        console.log ("Success installed: " + config.applicationName + ". The Configuration has been written out to app-config.json");
        console.log ("To Launch the application type 'sudo start node-aws-deploy'");
        process.exit (0);
    }
    else{
        console.log ("There were errors. Errors:" + err);
        process.exit (1);
    }
});






