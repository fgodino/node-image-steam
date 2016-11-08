var Image = require('../../image');
var resize = require('./resize');
var _ = require('lodash');
var sharp = require('sharp');
var async = require('async');
var helpers = require('../../helpers');

var cache = {};

module.exports = function(context, stepInfo, cb) {

  if(!stepInfo.path){
    return void cb(new Error("overlay path is required"))
  }
  
  var storageOpts = context.storage.options,
      storageDriver = context.storage.getDriver(storageOpts)

  stepInfo.path = decodeURIComponent(stepInfo.path);

  fetchImage(!!stepInfo.cache, function(err, overlayImg){

    if(stepInfo.width || stepInfo.height || stepInfo.offsetX || stepInfo.offsetY ){
      var overlaySharp = sharp(overlayImg.buffer);

      async.series([
        function getInfo(cb){
          
          //Avoid metadata retrieval
          if(overlaySharp.info && overlaySharp.info.width && overlaySharp.info.height){
            return void cb(null)
          }

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
            relativeTo : !!stepInfo.relative ? context.processedImage : null,
            canGrow : 'true'
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
          
          overlaySharp.png().toBuffer(function(err, outputBuffer) {
            if (err) {
              return void cb(err);
            }

            context.sharp.overlayWith(outputBuffer, {
              left : offset.left || 0,
              top : offset.top || 0,
              gravity : stepInfo.gravity
            })

            cb(null);

          });
        },
      ], cb);

    } else {
      context.sharp.overlayWith(overlayImg.buffer, {
        gravity : stepInfo.gravity
      })
      cb(null);
    }

  });

  function fetchImage(cacheImg, cb){
    if(cache.hasOwnProperty(stepInfo.path)){
      return void cb(null, cache[stepInfo.path]);
    } else {
      storageDriver.fetch(storageOpts, stepInfo.path, null, function(err, image, imgData) {
        if (err) {
          context.storage.emit('warn', err);
          return void cb(err);
        }

        // backward compatible
        if (!(image instanceof Image)) {
          image = new Image(image, imgData);
        }

        if(cacheImg){
          cache[stepInfo.path] = image
        }

        cb(null, image);
      });
    }
  }
};


