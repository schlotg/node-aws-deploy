var readline = require('readline');
var fs = ('fs');
var exec = require ('child_process').exec;
var async = require ("async");
var app_path, app_name, ssh_file, git_url;

var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


async.waterfall ([

    function (done){
        // Installs the whole setup
        console.log ("\n\nWELCOME TO THE NODE-AWS-DEPLOY INSTALLER");
        console.log ("This installs your application onto AWS and allows automatic deployment just by pushing to your remote git repository." +
            " Just answer a few questions and everything will be setup");
        console.log ("1) Enter your applications full path (example: \MyCoolApplication)");
        done ();
    },
    function (done){
        rl.question("1) Enter your application's folder. (Path only relative to the current directory, no file names. Example  'MyCoolApplication'):", function(answer) {
            fs.mkdirSync (answer, function (err){
                app_path = anwer;
                rl.close();
                done ();
            });
        });
    },
    function (done){
        rl.question("2) Enter your application's name:", function(answer) {
            app_name = answer;
            rl.close();
            done ();
        });
    },
    function (done){
        rl.question("3) Enter your application's entry point (defaults to 'start.js'):", function(answer) {
            app_entry = answer;
            rl.close();
            done ();
        });
    },
    function (done){
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
    },
    function (done){
        rl.question("4) Please take a second to copy the ssh key from this server, listed below, and paste into your git repository service (such as github). This will authorize this server AMI to " +
            "clone your repository and perform git pulls. Press <enter> when done" + ssh_file, function(answer) {
            rl.close();
            done ();
        });
    },
    function (done){
        rl.question("5) Now that your Git repository has been configured, enter the ssh url for remote access so this server can clone it:" , function(answer) {
            git_url = answer;
            if (git_url){
                console.log ("  Cloning your repository...");
                var child = exec ('cd ' + app_path + '; sudo git clone ' + git_url, function (err, std, ster){
                    if (err){
                        rl.close();
                        done (err);
                    }
                    else{
                        console.log (std);
                        rl.close();
                        done ();
                    }
                });
            }
            else{
                rl.close();
                done ();
            }
        });
    },
], function (err){
    if (!err){
        console.log ("Success");
    }
    else{
        console.log ("There were errors. Errors:" + err);
    }
});






