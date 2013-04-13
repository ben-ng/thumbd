var aws = require('aws-sdk'),
	_ = require('underscore'),
	Grabber = require('./grabber').Grabber,
	Thumbnailer = require('./thumbnailer').Thumbnailer,
	Saver = require('./saver').Saver,
	fs = require('fs');

function Worker(opts) {
	_.extend(this, {
		thumbnailer: null,
		grabber: null,
		saver: null,
		aws_key: process.env.AWS_KEY,
		aws_secret: process.env.AWS_SECRET,
		sqs_queue: process.env.SQS_QUEUE
	}, opts);

	aws.config.update({accessKeyId: process.env.AWS_KEY, secretAccessKey: process.env.AWS_SECRET});
	this.sqs = new aws.SQS;
}

Worker.prototype.start = function() {
	this._processSQSMessage();
};

Worker.prototype._processSQSMessage = function() {
	var _this = this;

	console.log('wait for message on ' + _this.sqs_queue)

	this.sqs.client.receiveMessage({
  	QueueUrl:process.env.SQS_QUEUE
	}, function (err, data) {
		if (err) {
			console.log(err);
			_this._processSQSMessage();
			return;
		}
		
		if(!data.Messages || data.Messages.length<=0) {
			_this._processSQSMessage();
			return;
		}

		// Handle the message we pulled off the queue.
		var handle = data.Messages[0].ReceiptHandle,
			job = JSON.parse( data.Messages[0].Body );

		_this._runJob(handle, job, function() {
			_this._processSQSMessage();
		});
	});
};

Worker.prototype._runJob = function(handle, job, callback) {
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
	var _this = this;

	this._downloadFromS3(job.original, function(err, localPath) {

		if (err) {
			console.log(err);
			callback();
			return;
		}

		_this._createThumbnails(localPath, job, function(err) {
			fs.unlink(localPath, function() {
				if (!err) {
					_this._deleteJob(handle);
				}
				callback();
			});
		});

	});
};

Worker.prototype._downloadFromS3 = function(remoteImagePath, callback) {
	this.grabber.download(remoteImagePath, function(err, localPath) {

		// Leave the job in the queue if an error occurs.
		if (err) {
			callback(err);
			return;
		}

		callback(null, localPath);
	});
};

Worker.prototype._createThumbnails = function(localPath, job, callback) {

	var _this = this;

	(function createNextThumbnail() {
		
		var description = job.descriptions ? job.descriptions.pop() : null;

		if (description) {

			var remoteImagePath = _this._thumbnailKey(job.original, description.suffix);

			_this.thumbnailer.execute(description, localPath, function(err, convertedImagePath) {

				if (err) {
					console.log(err);
					callback(err);
					return;
				}

				_this._saveThumbnailToS3(convertedImagePath, remoteImagePath, function(err) {

					if (err) {
						callback(err);
						return;
					}

					createNextThumbnail();
				});

			});
		} else {
			callback(null);
		}

	})();
};

Worker.prototype._saveThumbnailToS3 = function(convertedImagePath, remoteImagePath, callback) {
	this.saver.save(convertedImagePath, remoteImagePath, function(err) {
		fs.unlink(convertedImagePath, function() {
			callback(err);
		});
	});
};

Worker.prototype._thumbnailKey = function(original, suffix) {
	var extension = original.split('.').pop(),
		prefix = original.split('.').slice(0, -1).join('.');
  
  if(prefix.length<=0) {
    return original + "_" + suffix + ".jpg";
  }
  else {
	 return prefix + '_' + suffix + '.jpg';
  }
};

Worker.prototype._deleteJob = function(handle) {
	this.sqs.client.deleteMessage({
  	 QueueUrl:process.env.SQS_QUEUE,
  	 ReceiptHandle: handle
	 }, function(err, resp) {	
	   console.log('deleted thumbnail job ' + handle);
	});
};

exports.Worker = Worker;