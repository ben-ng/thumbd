var _ = require("underscore"),
	exec = require('child_process').exec,
	tmp = require('tmp'),
	fs = require('fs');

function Thumbnailer(opts) {
}

Thumbnailer.prototype.execute = function(description, localPath, onComplete) {
	var _this = this;

	// parameters for a single execution
	// of the thumbnailer.
	_.extend(this, {
		localPath: localPath,
		width: description.width,
		height: description.height,
		strategy: (description.strategy || 'bounded'),
		background: (description.background || 'black'),
		onComplete: onComplete
	});

	this.createConversionPath(function(err) {

		if (err) {
			_this.onComplete(err);
			return;
		}

		// apply the thumbnail creation strategy.
		if (!_this[_this.strategy]) {
			_this.onComplete('could not find strategy ' + _this.strategy);
		} else {
			_this[_this.strategy]()
		}
	});
};

Thumbnailer.prototype.createConversionPath = function(callback) {
	_this = this;

	tmp.file({postfix: ".jpg"}, function(err, convertedPath, fd) {
		_this.convertedPath = convertedPath;
		callback(err);
	});
};

Thumbnailer.prototype.execCommand = function(command) {
	var _this = this;

	exec(command, function(err, stdout, stderr) {
		
		console.log('running command ', command);

		if (err) {
			console.log(err);
			_this.onComplete(err);
			return;
		}
		
		// make sure the conversion was successful.
		fs.stat(_this.convertedPath, function(err, stat) {
			err = err || stat.size === 0 ? 'zero byte thumbnail created' : null;
			if (err) {
				_this.onComplete(err);
				return;
			}
			_this.onComplete(null, _this.convertedPath);
		});

	});
};

exports.Thumbnailer = Thumbnailer;

Thumbnailer.prototype.matted = function() {
	var thumbnailCommand = 'convert "' + this.localPath + '[0]" -thumbnail ' + (this.width * this.height) + '@ -gravity center -background ' + this.background + ' -extent ' + this.width + 'X' + this.height + ' ' + this.convertedPath;
	
	this.execCommand(thumbnailCommand);
};

Thumbnailer.prototype.bounded = function() {
	var dimensionsString = _this.width + 'X' + _this.height,
		thumbnailCommand = 'convert "' + _this.localPath + '[0]" -thumbnail ' + dimensionsString + ' ' + _this.convertedPath;

	_this.execCommand(thumbnailCommand);
};

Thumbnailer.prototype.fill = function() {
	var dimensionsString = _this.width + 'X' + _this.height,
		thumbnailCommand = 'convert "' + _this.localPath + '[0]" -resize ' + dimensionsString + '^ -gravity center -extent ' + dimensionsString + ' ' + _this.convertedPath;

	_this.execCommand(thumbnailCommand);
}