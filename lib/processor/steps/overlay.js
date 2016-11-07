var Image = require('../../image');
var resize = require('./resize');
var _ = require('lodash');
var sharp = require('sharp');
var async = require('async');
var helpers = require('../../helpers');

module.exports = function(context, stepInfo, cb) {
  
  var storageOpts = context.storage.options,
      storageDriver = context.storage.getDriver(storageOpts)

  storageDriver.fetch(storageOpts, stepInfo.path, null, function(err, overlayImg, imgData) {
    if (err) {
      context.storage.emit('warn', err);
      return void cb(err);
    }

    // backward compatible
    if (!(overlayImg instanceof Image)) {
      overlayImg = new Image(overlayImg, imgData);
    }

    if(!stepInfo.width && !stepInfo.height){
      context.sharp.overlayWith(overlayImg.buffer, _.pick(stepInfo, ['top', 'left', 'gravity']))
      cb(null);
    } else {

      var overlaySharp = sharp(overlayImg.buffer);

      async.series([
        function getInfo(cb){
          overlaySharp.metadata(function(err, metadata) {
            if (err) {
              return void cb(err);
            }

            delete metadata.exif;
            delete metadata.icc;
            overlayImg.info = _.merge(overlayImg.info, metadata);
            cb(null);
          });
        },
        function resizeOverlay(cb){

          resize(_.extend({}, context, {
            sharp : overlaySharp,
            processedImage : overlayImg
          }), {
            width : stepInfo.width,
            height : stepInfo.height,
            relativeTo : stepInfo.relative ? context.processedImage : null
          })

          var offset =  {
            top : stepInfo.offsetY,
            left : stepInfo.offsetX
          };

          helpers.dimension.resolveStep(context.processedImage, offset);

          if(offset.top < 0){
            offset.top = context.processedImage.info.height + offset.top - overlayImg.info.height;
          }

          if(offset.left < 0) {
            offset.left = context.processedImage.info.width + offset.left - overlayImg.info.width;
          }
          
          overlaySharp.toBuffer(function(err, outputBuffer) {
            if (err) {
              return void cb(err);
            }

            context.sharp.overlayWith(outputBuffer, {
              left : offset.left || 0,
              top : offset.top || 0,
            })

            cb(null);

          });
        },
      ], cb)
    }

  });

};


