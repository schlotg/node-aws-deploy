
var fs = require('fs');
var exec = require ('child_process').exec;
var async = require ("async");
var app_path, app_name, ssh_file, git_url, app_entry;
var i = 0;
var prompt = require ("prompt");


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
        console.log (++i + ") Enter your application's folder. (Path only relative to the current directory, no file names. Example  'MyCoolApplication')");
        prompt.get (['folder'], function (err, results){
            var answer = results['folder'];
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
            var answer = results['name'];
            app_name = answer;
            done ();
        });
    },
    function (done){
        console.log (++i + ") Enter your application's entry point (defaults to 'start.js')");
        prompt.get (['entry point'], function(err, results) {
            var answer = results['entry point'];
            app_entry = answer;
            done ();
        });
    },
    function (done){
        console.log (++i + ") Enter your email address to seed the ssh key");
        prompt.get (['email'], function(err, results) {
            var email = results['email'];
            // go get the ssh key or create one if it doesn't exist
            try { ssh_file = fs.readFileSync ("/root/.ssh/id_rsa.pub");}
            catch (err) {ssh_file = null;}
            if (!ssh_file){
                var child = exec ('sudo ssh-keygen -t rsa -C "' + email + '"', function (err, std, ster){
                    if (err){done (err);}
                    else{
                        ssh_file = fs.readFileSync ("/root/.ssh/id_rsa.pub");
                        done ();
                    }
                });
            }
            done ();
        });
    },
    function (done){
        console.log(++i + ") Please take a second to copy the ssh key from this server, listed below, and paste into your git repository service (such as github). This will authorize this server AMI to " +
            "clone your repository and perform git pulls. Press <enter> when done.");
        console.log ("\n" + ssh_file + "\n");
        prompt.get (['<enter>'], function(err, results) {
            done ();
        });
    },
    function (done){
        console.log (++i + ") Now that your Git repository has been configured, enter the ssh url for remote access so this server can clone it:");
        prompt.get (['Git repository URL'], function (err, results){
            var git_url = results['Git repository URL'];
            if (git_url){
                console.log ("  Cloning your repository...");
                var child = exec ('cd ' + app_path + '; sudo git clone ' + git_url, function (err, std, ster){
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
], function (err){
    if (!err){
        console.log ("Success");
    }
    else{
        console.log ("There were errors. Errors:" + err);
    }
});






