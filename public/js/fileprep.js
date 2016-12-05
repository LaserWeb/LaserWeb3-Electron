var Xtofix;
var Ytofix;
var oldxscale = 0;
var oldyscale = 0;


function filePrepInit() {

  $('#rotLeftBtn').on('click', function() {
    if (fileParentGroup) {
      fileObject.rotateZ(Math.PI / 4);
      putFileObjectAtZero();
    }
  });

  $('#rotRightBtn').on('click', function() {
    if (fileParentGroup) {
      fileObject.rotateZ(Math.PI / -4);
      putFileObjectAtZero();
    }
  });

  $('#resetRot').on('click', function() {
    if (fileParentGroup) {
      fileObject.rotation.z = 0;
      putFileObjectAtZero();
    }
  });

  $("#rotationval").change(function() {
      var rotation = $(this).val();
      console.log('Rotating from ', ((fileObject.rotation.z / Math.PI * 180).toFixed(0) * -1 ), ' to ', rotation);
      fileObject.rotateZ((rotation * Math.PI/ 180) * -1);
      putFileObjectAtZero();
  });


  $('#translateBtn').on('click', function() {
      if ($("#translateBtn").hasClass("btn-primary")) {
          $("#translateBtn").removeClass("btn-primary")
          $("#translateBtn").addClass("btn-default")
          scene.remove(control);
          controls.enableZoom = true; // optional
          controls.enablePan = true;
          controls.enableRotate = true;
      } else {
          $("#translateBtn").removeClass("btn-default")
          $("#resizeBtn").removeClass("btn-primary")
          $("#resizeBtn").addClass("btn-default")
          $("#translateBtn").addClass("btn-primary")
          control.setMode("translate");
          scene.add(control);
          controls.enableZoom = false; // optional
          controls.enablePan = false;
          controls.enableRotate = false;
      };
  });

  $('#resizeBtn').on('click', function() {
      if ($("#resizeBtn").hasClass("btn-primary")) {
          $("#resizeBtn").removeClass("btn-primary")
          $("#resizeBtn").addClass("btn-default")
          scene.remove(control);
          controls.enableZoom = true; // optional
          controls.enablePan = true;
          controls.enableRotate = true;
      } else {
          $("#resizeBtn").removeClass("btn-default")
          $("#translateBtn").removeClass("btn-primary")
          $("#translateBtn").addClass("btn-default")
          $("#resizeBtn").addClass("btn-primary")
          control.setMode("scale");
          scene.add(control);
          controls.enableZoom = false; // optional
          controls.enablePan = false;
          controls.enableRotate = false;
      }
  });

  $('#linkAspectBtn').on('click', function() {
      if ($("#linkAspect").hasClass("fa-link")) {
          // $( "#linkAspectBtn" ).removeClass( "btn-primary" )
          // $( "#linkAspectBtn" ).addClass( "btn-default" )
          $('#linkAspect').removeClass('fa-link');
          $('#linkAspect').addClass('fa-unlink');
          $("#linkval").html('Unlinked');
      } else {
          // $( "#linkAspectBtn" ).removeClass( "btn-default" )
          // $( "#linkAspectBtn" ).removeClass( "btn-primary" )
          // $( "#linkAspectBtn" ).addClass( "btn-default" )
          // $( "#linkAspectBtn" ).addClass( "btn-primary" )
          $('#linkAspect').removeClass('fa-unlink');
          $('#linkAspect').addClass('fa-link');
          $("#linkval").html('Linked');
      }
  });

  $('#stepscaleup').on('click', function() {
    var oldValue = $("#scaleFactor").val();
    var newVal = parseFloat(oldValue) + 1;
    var newVal = newVal.toFixed(0)
    $("#scaleFactor").val(newVal);
    scaleChange();
  });

  $('#stepscaledn').on('click', function() {
    var oldValue = $("#scaleFactor").val();
    var newVal = parseFloat(oldValue) - 1;
    var newVal = newVal.toFixed(0)
    $("#scaleFactor").val(newVal);
    scaleChange();
  });

  $('#panleft').on('click', function() {
    var oldValue = controls.target.x
    var newVal = oldValue + 20;
    TweenMax.to(controls.target,0.25,{x:newVal,onUpdate:function(){
                        controls.update();
                         }});
    // controls.target.x = newVal
    //controls.object.position.x = newVal;
    // controls.update();
  });

  $('#panright').on('click', function() {
    var oldValue = controls.target.x
    var newVal = oldValue - 20;
    TweenMax.to(controls.target,0.25,{x:newVal,onUpdate:function(){
                        controls.update();
                         }});
    // controls.target.x = newVal
    // controls.object.position.x = newVal;
    // controls.update();
  });

  $('#panup').on('click', function() {
    var oldValue = controls.target.y
    var newVal = oldValue - 20;
    TweenMax.to(controls.target,0.25,{y:newVal,onUpdate:function(){
                        controls.update();
                         }});
    // controls.target.y = newVal
    // controls.object.position.y = newVal;
    // controls.update();
  });

  $('#pandown').on('click', function() {
    var oldValue = controls.target.y
    var newVal = oldValue + 20;
    TweenMax.to(controls.target,0.25,{y:newVal,onUpdate:function(){
                        controls.update();
                         }});
    // controls.target.y = newVal
    // controls.object.position.y = newVal;
    // controls.update();
  });

  $('#zoomout').on('click', function() {
    // var oldValue = controls.target.y
    // var newVal = oldValue + 20;
    // controls.target.y = newVal
    TweenMax.to(camera,0.25,{fov:"+=5",onUpdate:function(){
                        camera.updateProjectionMatrix();
                         }});
    controls.update();
  });

  $('#zoomin').on('click', function() {
    // var oldValue = controls.target.y
    // var newVal = oldValue + 20;
    // controls.target.y = newVal
    TweenMax.to(camera,0.25,{fov:"-=5",onUpdate:function(){
                        camera.updateProjectionMatrix();
                         }});
    controls.update();
  });


    // useOffset = $('#useOffset').val()
    // if (useOffset.indexOf('Disable') == 0) {
    //     $('#inflateFeature').hide();
    // }


}

function resetView() {
  if (objectsInScene.length > 0) {
      var insceneGrp = new THREE.Group()
      for (i = 0; i < objectsInScene.length; i++) {
        var object = objectsInScene[i].clone();
        insceneGrp.add(object)
      }
      // scene.add(insceneGrp)
      viewExtents(insceneGrp);
      // scene.remove(insceneGrp)
    } else {
      viewExtents(workspace);
  }

}

function putFileObjectAtZero(object) {

  if (object) {
  } else {
      object = fileParentGroup
  }

  var bbox2 = new THREE.Box3().setFromObject(object);
  // console.log('bbox for putFileObjectAtZero: Min X: ', (bbox2.min.x + (laserxmax / 2)), '  Max X:', (bbox2.max.x + (laserxmax / 2)), 'Min Y: ', (bbox2.min.y + (laserymax / 2)), '  Max Y:', (bbox2.max.y + (laserymax / 2)));
  Xtofix = -(bbox2.min.x + (laserxmax / 2));
  imagePosition = $('#imagePosition').val()
  // console.log('ImagePosition', imagePosition)
  if (imagePosition == "TopLeft") {
      Ytofix = (laserymax / 2) - bbox2.max.y;
  } else {
      Ytofix = -(bbox2.min.y + (laserymax / 2));
  }
  // console.log('X Offset', Xtofix)
  // console.log('Y Offset', Ytofix)
  object.translateX(Xtofix);
  object.translateY(Ytofix);
  calcZeroOffset(object);

}


function calcZeroOffset(object) {
      if (object) {
        var bbox2 = new THREE.Box3().setFromObject(object);
        // console.log('bbox for object: Min X: ', (bbox2.min.x + (laserxmax / 2)), '  Max X:', (bbox2.max.x + (laserxmax / 2)), 'Min Y: ', (bbox2.min.y + (laserymax / 2)), '  Max Y:', (bbox2.max.y + (laserymax / 2)));
        xfromzero = -(bbox2.min.x + (laserxmax / 2));
        imagePosition = $('#imagePosition').val()
        // console.log('ImagePosition', imagePosition)
        if (imagePosition == "TopLeft") {
            yfromzero = (laserymax / 2) - bbox2.max.y;
        } else {
            yfromzero = -(bbox2.min.y + (laserymax / 2));
        }
        var xoffset = ( object.position.x - xfromzero )
        var yoffset = ( object.position.y - yfromzero )
        // console.log('X Offset', xoffset )
        // console.log('Y Offset', yoffset )
        object.userData.offsetX = xoffset
        object.userData.offsetY = yoffset
    }

}
