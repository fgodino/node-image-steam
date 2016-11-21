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

  var overlaySharp;
  var transformationHash = helpers.imageSteps.getHashFromSteps(stepInfo);

  if(cache.hasOwnProperty(transformationHash)){
    overlaySharp = sharp(cache[transformationHash].buffer);
    overlayWith(cache[transformationHash]);
    return void cb(null);
  }

  async.waterfall([
    function fetchImage(cb){

      if(cache[stepInfo.path]){
        return void cb(null, cache[stepInfo.path])
      }

      storageDriver.fetch(storageOpts, stepInfo.path, null, function(err, image, imgData) {
        if (err) {
          context.storage.emit('warn', err);
          return void cb(err);
        }

        // backward compatible
        if (!(image instanceof Image)) {
          image = new Image(image, imgData);
        }

        if(!!stepInfo.cache){
          cache[stepInfo.path] = image;
        }

        cb(null, image);
      });
    },
    function getInfo(overlayImg, cb){

      overlaySharp = sharp(overlayImg.buffer);

      //Avoid metadata retrieval
      if(overlayImg.info && overlayImg.info.width && overlayImg.info.height){
        return void cb(null, overlayImg)
      }

      overlaySharp.metadata(function(err, metadata) {
        if (err) {
          return void cb(err);
        }

        delete metadata.exif;
        delete metadata.icc;
        overlayImg.info = _.merge(overlayImg.info, metadata);
        cb(null, overlayImg);
      });
    },
    function resizeOverlay(overlayImg, cb){
      
      resize(_.extend({}, context, {
        sharp : overlaySharp,
        processedImage : overlayImg
      }), {
        width : stepInfo.width,
        height : stepInfo.height,
        relativeTo : !!stepInfo.relative ? context.processedImage : null,
        canGrow : 'true'
      })

      overlaySharp.png().toBuffer(function(err, buffer){
        if(err){
          return void cb(err);
        }
        // backward compatible
        var resizedImage = new Image(overlayImg.info, buffer);
        cb(err, resizedImage);
      });
    },
    function cacheResult(resizedImage, cb){
      if(!!stepInfo.cache && !stepInfo.relative){
        cache[transformationHash] = resizedImage;
      }
      cb(null, resizedImage);
    }
  ], function(err, resizedImage){
    if(err){
      return void cb(err);
    }
    overlayWith(resizedImage)
    cb();
  });

  function overlayWith(image){
    
    var offset =  {
      top : stepInfo.offsetY,
      left : stepInfo.offsetX
    };

    helpers.dimension.resolveStep(context.processedImage, offset);

    if(offset.top < 0){
      offset.top = context.processedImage.info.height + offset.top - image.info.height;
    }

    if(offset.left < 0) {
      offset.left = context.processedImage.info.width + offset.left - image.info.width;
    }

    context.sharp.overlayWith(image.buffer, {
      left : offset.left || 0,
      top : offset.top || 0,
      gravity : stepInfo.gravity
    })
  }
};


