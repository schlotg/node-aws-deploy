Node AWS Deploy
=====
This is my attempt at an easy to use and robust deployment and install system to get your Node app up and running, quickly and easily on AWS. node-aws-deploy is designed to take a web hook HTTP post from a Git repository service and than automatically trigger a deployment across multiple servers. New servers that are started up will automatically grab the latest changes.
node-aws-deploy sits outside your application so it doesn't clutter up your code base. It relies heavily on the package.json file so your application must have one to work properly.

##How it works
node-aws-deploy has install scripts that install 'Node', 'n', and 'node-aws-deploy'. node-aws-deploy uses upstart to launch node-aws-deploy on server startup, and relaunch if your application dies.
On startup, node-aws-deploy does a git pull of the configured git branch of your remote git repository. It then checks the the node version specified in package.json. This is specified in the 'nodeVersion' field which is ignored by NPM. If the node version specified in package.json does not match the current node version, node-aws-deploy uses 'n' to switch versions to the one specified. If Nodejs is changed to a different version, the system is restarted.
Next, node-aws-deploy compares the contents of package.json to a local copy. If anything has changed, those packages are removed and re-installed using NPM.
Finally, node-aws-deploy changes the working directory to your applications folder, then loads and executes the configured .js file that is your applications starting point.

To handle live updates, node-aws-deploy implements a server that listens on a configured port. A webhook can be configured that posts to the node-aws-deploy listener on Git pushes into your repository. Typically, several servers are configured behind a load balancer. The webhook will be dispatched by the load balancer to one of the running servers. The server will find all of the other servers of that same type and forward the webhook along. Every server will do a git pull and then update itself.
This allows a git branch to be setup that the servers will operate off of. Whenever a deployment needs to happen, a developer simply merges into that branch and pushes. Deployment happens automatically.

This is a great way to handle test builds/deployments but may not be the best way to handle production builds. node-aws-deploy relies on your git respository, and the NPM repository being up and running and this introduces more points of failure. A much safer solution for production is to take a working and tested build, create and AMI out of it, set the the user data to {deploy:false} and then update your production scale group with this new AMI.

<Code to build out and AMI from an existing node-aws-deploy build and deploy to a scale group coming soon!>

###Setting up the AWS Node Server Manually
====
These instructions are specific to setting up a node.js server on a AWS Amazon Linux Instance. They can be easily adapted to other Linux instances on other cloud platforms. The instructions below also are written for a MAC interfacing with the AWS EC2 instances. It should work as is on Linux, but some sort of Secure Shell program will be needed on a Windows machine.

Create an AWS account http://aws.amazon.com/
Launch an EC2 instance (Make sure you have downloaded the ssh key/pair so you can connect to your instance). Make sure it is an Amazon Linux 64 bit AMI. Set the user data to:

    {"type":"development", "listensTo": "develop", "deploy":true}

Where type, is the instance type. The name only matters in that it should make sense to you and this instance will communicate with others of the same type. The ListensTo field specifies which branch of your repository it should listen to and automatically pull from when it sees changes and deploy turns this system on and off. You might want if off in your production deploy but have it auto deploy for develop and testing builds.
On Mac, open a terminal and change directory to the folder containing your key pair your are using with the instance

Ensure your key pair has the right permissions (Substitute key_pair_name with the actual name of your file):

    sudo chmod 400 key_pair_name.pem

Launch a secure shell into the ec2 instance (substitute dns_addr with the dns address of the running ec2 instance you just launched)

        ssh -i key_pair_name.pem -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no ec2-user@dns_addr

From the ssh terminal:

    Allow node to execute as a super user by modifying the /etc/sudoers file. Type the following:

        sudo su
        vi /etc/sudoers

    Use the down keyboard arrow to find this line:

        Defaults	requiretty

    press <i> and insert a ‘#’ before the Defaults:

    use the down keyboard arrow to find this line:

        Defaults	secure_path = /sbin:/bin:/usr/sbin:/usr/bin

    press and insert the following at the end of this line:

        :/usr/local/bin

    press <esc> and then type :wq!

    type exit and press enter

Generate a ssh key (use your email address):

    sudo ssh-keygen -t rsa -C "your_email@mail.com"
    press <enter> for the rest of the questions

Install Git and clone the install script:

        sudo yum install git
        sudo git clone https://github.com/schlotg/node-aws-deploy.git
        sudo chmod 777 node-aws-deploy/install_aws
        sudo node-aws-deploy/install_aws


###Setting up a AWS Node Server from the node-aws-deploy image

An even easier approach is to create an instance off of the aws-node-deploy image in the Amazon Store

Create an AWS account http://aws.amazon.com/
Launch an EC2 instance (Make sure you have downloaded the ssh key/pair so you can connect to your instance). Make sure based off of the node-aws-deploy AMI. Set the user data to:

    {"type":"development", "listensTo": "develop", "deploy":true}

Where type, is the instance type. The name only matters in that it should make sense to you and this instance will communicate with others of the same type. The ListensTo field specifies which branch of your repository it should listen to and automatically pull from when it sees changes and deploy turns this system on and off. You might want if off in your production deploy but have it auto deploy for develop and testing builds.
On Mac, open a terminal and change directory to the folder containing your key pair your are using with the instance

Ensure your key pair has the right permissions (Substitute key_pair_name with the actual name of your file):

    sudo chmod 400 key_pair_name.pem

Launch a secure shell into the ec2 instance (substitute dns_addr with the dns address of the running ec2 instance you just launched)

        ssh -i key_pair_name.pem -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no ec2-user@dns_addr

From the ssh terminal:

Generate a ssh key (use your email address):

    sudo ssh-keygen -t rsa -C "your_email@mail.com"
    press <enter> for the rest of the questions

Ensure you have the latest node-aws-deploy and AWS updates:

        sudo yum update
        cd ~/node-aws-deploy
        sudo git pull
        sudo node install.js


###Using node-aws-deploy

To launch type:

    sudo start <your application name>

To stop type:

    sudo stop <your application name>

To restart type:

    sudo restart <your application name>

To manually launch it so you can see output at the console:

    sudo stop <your application name>
    cd ~/node-aws-deploy
    sudo node _start.js

To reconfigure you can always relaunch install.js from the ~/node-aws-deploy directory or if you know 'vi' you can manually edit the .app-config.json by typing:

    cd ~/node-aws-deploy
    vi .app-config.json

Your application will now run every time the server is started. On start and restart node-aws-deploy will: grab the latest code from your git repository branch and look for NPM dependency changes.
On a web hook post node-aws-deploy will find all the running AWS instances of this same type and restart them so updates are propagated across the entire scale group.

Once your application is setup and running correctly, you will want to create a AMI that will be used in your scale group. To create an AMI:

1. Open the AWS console and select EC2
2. Go to instances, and find the instance that was just configured with node-aws-deploy
3. With that volume selected, select actions->create image. Name it appropriately and click create.
4. This new AMI should now be available and listed in the AMI section. Use it to launch new instances, create scale groups, etc...


###Triggering live updates

Most Git repositories have a concept of a webhook. This is a mechanism that performs a post or get on a push to your directory. node-aws-deploy only supports pushes at this time. The examples given below were written for gitHub's web hooks but should be applicable to other remote repositories.

    For a unsecure post on port 8000 with a secret of 'no_limits' the web hook URL would look like (make sure master is always set to true):

        http://mycoolwebapp.com:8000/post/pull?secret=no_limits&master=true

    For a secure post on port 8000 with a secret of 'no_limits' the web hook URL would look like (make sure master is always set to true):

        http://mycoolwebapp.com:8000/post/pull?secret=no_limits&master=true

It is highly recommended that you use a secure post so your secret and information about your code base is not visible to others. The secret can be anything but must be configured on the server in the .app-config.json (you can use the install.js to set it) and it must match the one posted form your webhook. This prevents people from triggering pulls on your server(s) for fun.
If a valid certificate is not configured with node-aws-deploy, a secure webhook cannot be used.

For Github select JSON for the payload and the 'pullField' in .app-config.json should be set to 'ref'.


###Misc

node-aws-deploy puts the following into environment variables which you application is free to inspect and use:

             process.env['CLOUD'] = <bool> is this running on an AWS server
             process.env['INSTANCE_ID'] = <string> EC2 instance id of this server.
             process.env['INSTANCE_DATA'] = <JSON> the user data associated with this ec2 instance


###Running Locally

node-aws-deploy when used locally on your development machine has the following functionality / benefits:

    1. It will not start a server to listen for webhooks or pull requests
    2. When it starts, it will automatically check for NPM dependency changes and the correct node version. It will update
        these as needed before starting the application. This will allow developers to add npm modules our update the
        current node version and have it automatically distributed across the team the next each team member pulls.
    3. When used with nodemon it is a great combination for development.

        nodemon _start.js

To use node-aws-deploy for multiple projects on a single development machine, it works best to have a copy of node-aws-deploy inside each project with its own configuration specific to each project.
To install and setup locally:

    1. Clone the repository in your application folder

        git clone https://github.com/schlotg/node-aws-deploy.git
        cd node-aws-deploy
        npm install -d

    2. Run the install.js script from within the node-aws-deploy folder

        cd node-aws-deploy
        node install.js

    3. Answer the questions to configure node-aws-deploy
    4. If you want to use nodemon install it globally.

        npm install -g nodemon

    5. launch the application from the terminal with:

        cd node-aws-deploy
        nodemon _start.js

            or

        cd node-aws-deploy
        node _start.js

###Using a pre-launch File

You can specify a pre-launch file that gets executed prior to the application launching. This allows you to start services, create files, etc... The file must be a node Javascript file that works with require. It must export a 'start' function. The start function takes a callback that will be called when the pre-launch is done executing. Calling the callback will signal node-aws-deploy to continue execution by executing the file that is the entry point for your application.
Specify the pre-launch file by setting it manually in .app-config.json or using install.js. The file name must be relative to the application path.

In its simplest form the pre-launch file would look like something like this:

    exports.start = function (cb){
        // do pre-launch stuff here
        console.log ("hello world");
        // call callback when done
        cb ();
    };