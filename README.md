Node AWS Deploy
=====
This is my attempt at an easy to use and robust deployment and install system to get your Node app up and running, quickly and easily on AWS. node-aws-deploy is designed to take a web hook HTTP post from a Git repository service and than automatically trigger a deployment across multiple servers. New servers that are started up will automatically grab the latest changes.

###Setting up the AWS Node Server
====
These instructions are specific to setting up a node.js server on a AWS Amazon Linux Instance. They can be easily adapted to other Linux instances on other cloud platforms. The instructions below also are written for a MAC interfacing with the AWS EC2 instances. It should work as is on Linux, but some sort of Secure Shell program will be needed on a Windows machine.

Create an AWS account http://aws.amazon.com/
Launch an EC2 instance (Make sure you have downloaded the ssh key/pair so you can connect to your instance). Make sure it is an Amazon Linux 64 bit AMI. Set the user data to:

    {"type":"development", "listensTo": "develop", "deploy":true}

Where type, is the instance type. The name only matters in that it should make sense to you and this instance will communicate with others of the same type. The ListensTo field specifies which branch of your repository it should listen to and automatically pull from when it sees changes and deploy turns this system on and off. You might want if off in your production deploy but have it auto deploy for develop and testing builds.
On Mac, open a terminal and change directory to the folder containing your key pair your are using with the instance

Ensure the key has the right permissions (Substitute key_pair_name with the actual name of your file):

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

In order for this to work correctly you need to have a valid package.json for your application and include the the following line in your list of dependencies:

    "node-aws-deploy":"git://github.com/schlotg/node-aws-deploy.git"

Install Git and clone the install script:

        sudo yum install git
        sudo git clone https://github.com/schlotg/node-aws-deploy.git
        sudo chmod 777 node-aws-deploy/install_aws
        sudo node-aws-deploy/install_aws

To launch type

    sudo start <your application name>

Your application will now run every time the server is started. On start and restart node-aws-deploy will: grab the latest code from your git repository branch and look for NPM dependency changes.
On a web hook post node-aws-deploy will find all the running AWS instances of this same type and restart them so updates are propagated across the entire scale group.



