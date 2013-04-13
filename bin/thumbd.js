#!/usr/bin/env node

var thumbd = require('../lib'),
	fs = require('fs'),
	aws = require('aws-sdk'),
	knox = require('knox'),
	argv = require('optimist').argv,
	mode = argv._.shift(),
	lastError = null,
	serverOpts = {
		aws_key: process.env.AWS_KEY,
		aws_secret: process.env.AWS_SECRET,
		sqs_queue: process.env.SQS_QUEUE,
		bucket: process.env.BUCKET
	},
	thumbnailOpts = {
		aws_key: process.env.AWS_KEY,
		aws_secret: process.env.AWS_SECRET,
		sqs_queue: process.env.SQS_QUEUE,
		descriptions: "./data/example.json",
		remote_image: null
	};

	aws.config.update({accessKeyId: process.env.AWS_KEY, secretAccessKey: process.env.AWS_SECRET});

function buildOpts(opts) {
	Object.keys(opts).forEach(function(key) {
		opts[key] = argv[key] || opts[key];
		if (!opts[key]) {
			lastError = "the environment variable '" + key + "' must be set.";
		}
	});
	return opts;
};

switch (mode) {
	case 'server':
		
		var opts = buildOpts(serverOpts);
		
		if (!lastError) {

			var s3 = knox.createClient({
				key: opts.aws_key,
				secret: opts.aws_secret,
				bucket: opts.bucket
			});

			var grabber = new thumbd.Grabber({
				s3: s3
			});

			var saver = new thumbd.Saver({
				s3: s3
			});

			var thumbnailer = new thumbd.Thumbnailer({
			});

			(new thumbd.Worker({
				thumbnailer: thumbnailer,
				saver: saver,
				grabber: grabber,
				aws_key: opts.aws_key,
				aws_secret: opts.aws_secret,
				sqs_queue: opts.sqs_queue
			})).start();

		} else {
			console.log(lastError);
		}
		break;
	case 'thumbnail':
	
		var opts = buildOpts(thumbnailOpts);
		
		if (!lastError) {
			
  		var sqs = new aws.SQS;
			
			/**
				job = {
					"original": "/foo/awesome.jpg",
					"descriptions": [{
						"suffix": "small",
						"width": 64,
						"height": 64
					}],
				}
			*/
			sqs.client.sendMessage(
			{
        QueueUrl:process.env.SQS_QUEUE,
        MessageBody: JSON.stringify({
          original: opts.remote_image,
          descriptions: JSON.parse(fs.readFileSync(opts.descriptions).toString())
        })
			}, function (err, data) {
				console.log(data);
			});
			
		} else {
			console.log(lastError);
		}
		break;
	default:
		console.log(
			"Usage: thumbd <command>\n\n",
			"where <command> is one of:\n",
			"\tthumbd server --aws_key=<key> --aws_secret=<secret> --tmp_dir=</tmp> --sqs_queue=<sqs queue name> --bucket=<s3 thumbnail bucket>\n",
			"\tthumbd thumbnail --remote_image=<path to image s3 or http> --descriptions=<path to thumbnail description JSON file> --aws_key=<key> --aws_secret=<secret> --sqs_queue=<sqs queue name>\n"
		)
}