Node AWS Deploy
=====
This is my attempt at an easy to use and robust deployment and install system to get your Node app up and running, quickly and easily on AWS.
node-aws-deploy is designed to take a web hook HTTP post from a Git repository service or a post generated on a development machine; and then automatically
trigger a deployment across a single or multiple server instances. New servers that are started up will automatically grab the latest changes.
node-aws-deploy typically sits outside your application to avoid clutter but in can live within your application directory just a easily.

Make sure that all the projects that will be using node-aws-deploy have package.json files defined in them as node-aws-deploy relies on these for deployment information.

##How it works
node-aws-deploy has install scripts that install 'Node', 'n', and 'node-aws-deploy'. node-aws-deploy uses upstart to launch node-aws-deploy on the server at startup. Upstart will
relaunch your application if it dies. When the user data is set to deploy:true, on startup, node-aws-deploy does a git pull of the configured git branch of your remote git repository.
It also performs git pulls on each of your dependency directories. It then checks the node
version specified in package.json. This is specified in the 'nodeVersion' field which is ignored by NPM. If the node version specified in package.json does not
match the current node version, node-aws-deploy uses 'n' to switch versions to the one specified. If Nodejs is changed to a different version, the system is restarted.
Next, node-aws-deploy compares the contents of package.json to a local copy (package.copy). If anything has changed, those packages are removed and re-installed using NPM.
Finally, node-aws-deploy changes the working directory to your applications folder, then loads and executes the configured .js file that is your applications entry point.

node-aws-deploy also handles project dependencies. If your project consists of several sub projects, you can configure node-aws-deploy to create separate git repositories
for each dependency, and then use the NPM link feature to create a symbolic link in the main projects node_modules directory. Each one of the dependency projects will have
git pulls and NPM dependency checks performed on them on pull requests or starts when deploy is set to true.

When user data deploy:true is set node-aws-deploy starts a server that listens on a configured port. A webhook can be configured that posts to the node-aws-deploy listener on
Git pushes into your repository. Typically, several servers are configured behind a load balancer. The webhook will be dispatched by the load balancer to one of the
running servers. This server will find all of the other servers of that same type and forward the webhook along. Every server will do a git pull and then update itself.
This allows a git branch to be setup that the servers will operate off of. Whenever a deployment needs to happen, a developer simply merges into that branch and pushes.
Deployment happens automatically. For more control, a developer can locally run the postToAllInstances.js script that will:
    1. Find all the servers that having a matching type in their user data
    2. Send them each one an HTTP request (can be /pull, /restart, or /rebuild) on the configured port
    3. Display the results

    pull - pulls and restarts the server
    restart - restarts the server
    rebuild - re-installs the npm dependencies by deleting the package.copy files

The deployment flow I am using at my company works like this:

    1. Developers work in two week sprints uploading to the development branch
    2. Once a sprint is complete the development branch is merged into the production branch
    3. postToAllInstances.js is called with the parameters: node postPullToAllInstances.js '{"type":"staging", "listensTo": "master", "deploy":true, "secure":true}'
        - This finds all the instances of type production and signals them to pull and restart
    4. Testing is done on this staging server until the code is deemed ready to deploy.
    5. createAMI.js is called to create an deployment AMI off of one of the staging server instances.
    6. launchAMI.js is called to deploy the AMI created above into a scale group that sits behind a load balancer

Rollbacks are performed by calling launchAMI with the previous version of the AMI

Hot fixes are performed by checking out the production branch, performing the fix, deploying to staging, testing, creating a new AMI, and then deploying to the production Load Balancer

node-aws-deploy is great for running on development machines as well. It won't pull changes automatically. (its the developers job to decide when to do that!)
But it will check that all the NPM and Node dependencies are correct and installed / uninstalled when the app is started.


###Setting up the AWS Node Server Manually
====
These instructions are specific to setting up a node.js server on a AWS Amazon Linux Instance. They can be easily adapted to other Linux instances on other cloud
platforms. These instructions below also are written for a MAC interfacing with the AWS EC2 instances. It should work as-is on Linux, at the very least a SSH
program will be needed to run on Windows.

Create an AWS account http://aws.amazon.com/
Launch an EC2 instance (Make sure you have downloaded the ssh key/pair so you can connect to your instance). Make sure it is an Amazon Linux 64 bit AMI. Set the
user data to:

    {"type":"development", "listensTo": "develop", "deploy":true}

Where type, is the instance type. The name only matters in that it should make sense to you and this instance will communicate with others of the same type. The
ListensTo field specifies which branch of your repository it should listen to and automatically pull from when it sees changes.
When deploy is set to true:

1. The node-aws-deploy server is started and listening for /pull, /restart, and rebuild
2. On restarts node-aws-deploy will pull the tip (git pull) from the master project and from any of its dependency list
3. On restarts node-aws-deploy will check node and npm dependencies in the master project and the dependency list and remove or install them as needed

When deploy is set to false:

1. On restarts node-aws-deploy will check node and npm dependencies in the master project and the dependency list and remove or install them as needed

You will likely want deploy set to false in your production deploy but have it set to true in staging and testing builds.


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

An even easier approach is to create an instance off of the aws-node-deploy image in the Amazon Store (Still In Progress)

Create an AWS account http://aws.amazon.com/
Launch an EC2 instance (Make sure you have downloaded the ssh key/pair so you can connect to your instance). Make sure based off of the node-aws-deploy AMI. Set the user data to:

    {"type":"development", "listensTo": "develop", "deploy":true}

Where type, is the instance type. The name only matters in that it should make sense to you and this instance will communicate with others of the same type. The ListensTo field specifies which branch of
your repository it should listen to and automatically pull from when it sees changes and deploy turns this system on and off. You might want if off in your production deploy but have it auto deploy for
develop and testing builds. On Mac, open a terminal and change directory to the folder containing your key pair your are using with the instance

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

Your application will now run every time the server is started. On start and restart node-aws-deploy will: grab the latest code from your git repository branch and look for Node and NPM dependency changes.
On a web hook post node-aws-deploy will find all the running AWS instances of this same type and restart them so updates are propagated across the entire scale group.
Additionally you can use the postToAllInstances.js script to trigger pulls from your local machine to your ec2 instances.

Once your application is setup and running correctly, you will want to create a AMI that will be used in your scale group. To create an AMI:

1. Open the AWS console and select EC2
2. Go to instances, and find the instance that was just configured with node-aws-deploy
3. With that volume selected, select actions->create image. Name it appropriately and click create.
4. This new AMI should now be available and listed in the AMI section. Use it to launch new instances, create scale groups, etc...

node-aws-deploy also comes with a createAMI.js script which allows you to create and AMI off of a running instance of the 'type' specified in its user data.
This is an easy way to create AMIs and do deployments from your local machine or even a dedicated server for that matter. All scripts that use AWS
services are dependent upon the .app-config.json having the AWS credentials set up correctly on the machine that the scripts are launched from.

###install.js
To change parameters you can always manually edit the .app-config.json or run the install.js script. install.js asks questions and builds
out the .app-config.json based on the answers. If you press enter on a question, the previous value of that param remains unchanged. This allows
you to quickly change only the parameters you need to change.


###Triggering live updates

####WebHooks
Most Git repositories have a concept of a webhook. This is a mechanism that performs a post or get on a push to your directory. node-aws-deploy only supports pushes at this time. The examples
given below were written for gitHub's web hooks but should be applicable to other remote repositories.

    For a unsecure post on port 8000 with a secret of 'no_limits' the web hook URL would look like (make sure master is always set to true):

        http://mycoolwebapp.com:8000/post/pull?secret=no_limits&master=true

    For a secure post on port 8000 with a secret of 'no_limits' the web hook URL would look like (make sure master is always set to true):

        http://mycoolwebapp.com:8000/post/pull?secret=no_limits&master=true

It is highly recommended that you use a secure post so your secret and information about your code base is not visible to others. The secret can be anything but must be configured on the server
in the .app-config.json (you can use the install.js to set it) and it must match the one posted form your webhook. This prevents people from triggering pulls on your server(s) for fun.
If a valid certificate is not configured with node-aws-deploy, a secure webhook cannot be used.

In Github, select JSON for the payload when setting up the webhook. The 'pullField' in .app-config.json should be set to 'ref'.

Make sure that the port being used for the webhook has a path through the load balancer to your servers and is configured correctly on the servers and on the web hook.

####Manually triggering a webhook
You can trigger a web hook manually if you want to test or if you prefer manual triggering. To do so make sure you have run the install.js program locally. Then run the manualWebHook.js you
can trigger it for different branches by passing in the branch like so:

    cd node-aws-deploy
    node manualWebHook.js master

####Triggering deployments locally
Webhooks might seem light a great idea at first, but even with small sized teams you can get into situations where the server is constantly pulling and being restarted. In a lot of cases
it makes a lot more sense to coordinate the deployments. The postPullToAllInstances.js script allows you to trigger the pull manually from a local development machine. You can also trigger
a restart or a rebuild. 'pull' and 'restart' are self explanatory but the rebuild command clears all the package.copy files in the master project and its dependencies so that all the npm
resources are pulled and re-installed from scratch.


'postPullToAllInstances.js' needs a instance data JSON string passed in so it knows what types of servers to look for and what repository they are listening for. Here is an example:

    cd node-aws-deploy
    node postPullToAllInstances.js "/pull" '{"type":"production","listensTo":"master","deploy":true}'

It is worth mentioning that a third parameter can be specified on the postPullToAllInstances. It is a JSON that contains command lime values you would like to specify on the next server start.
It is ver useful for specifying versions and app-cache dates. Here is an example of the shell script we use to trigger staging deployments:

     cd your_application_directory/node-aws-deploy
     echo Enter type:
     read type
     echo Enter the version:
     read version
     dateTime=$(date +"%m-%d-%y%-T")
     route="/pull"
     args="{\"version\":\"$version\",\"appCacheDate\":\"$dateTime\"}"
     params="{\"type\":\"$type\",\"listensTo\":\"master\",\"secure\":true}"
     echo -e "\nSignaling Servers to Pull. Waiting for server response...\n"
     node postToAllInstances.js $route $params $args

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

To use node-aws-deploy for multiple projects on a single development machine, it works best to have a copy of node-aws-deploy inside each project with its own configuration specific
to each project.

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

You can specify a pre-launch file that gets executed prior to the application launching. This allows you to start services, create files, etc... The file must be a node Javascript
file that works with require. It must export a 'start' function. The start function takes a callback that will be called when the pre-launch is done executing. Calling the
callback will signal node-aws-deploy to continue execution by executing the file that is the entry point for your application. Specify the pre-launch file by setting it manually
in .app-config.json or using install.js. The file name must be relative to the application path.

In its simplest form the pre-launch file would look like something like this:

    exports.start = function (cb){
        // do pre-launch stuff here
        console.log ("hello world");
        // call callback when done
        cb ();
    };

###Security
It is my opinion that it is important to take reasonable steps to keep your assets secure. You should minimize the exposure to API access keys etc... The first step is to create a set
of development keys and when possible that limit the scope and functionality to just the bare minimum for normal day to day development and testing. Then create a set of production accounts
and keys that access the production assets. The development keys will usually travel with the code base and are accessible by developers while the production keys have limited access. To
facilitate this practice I recommend creating a private directory within node-aws-deploy and copy production only keys into it. You can then use the prelaunch.js file to determine the type
of deployment and read the appropriate data out of the private directory. The data stays stored on the AMI so you need to be careful to limit access to.

Other approaches include having a limited access repository on Git that only the production builds access. Or use encryption keys to encode the data in the public repository and then
decode it on the production build with the key stored on the server only. The point is there are many approaches that can work within the node-aw-deploy framework.

####Putting it all together
In AWS you can specify per instance or per launch configuration user data for the ec-2 instances. This is the mechanism that is used to distinguish the functionality differences across
instances and allows the use of a single AMI created in a staging server to also be deployed in production and have the restart pulling and command server turned off in production only.
Any other differences such as different keys sets across deployments can be accomplished by using the user defined prelaunch.js to steer the application to the production assets.


