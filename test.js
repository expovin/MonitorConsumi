const chk = require('./listaControlli');
const settings = require('./settings');
const mqtt = require('mqtt');

//chk.test()

IoTdataStream  = mqtt.connect(settings.MQTT.host,settings.MQTT)

IoTdataStream.on('connect', function () {
    let device = "lavatrice";
    let cmd = "cmnd/"+device+"/POWER";
    console.log("Topic : "+cmd);
    IoTdataStream.subscribe('#', function (err) {
        if (!err) {
            IoTdataStream.publish(cmd,'ON')
        }
      })

    
    //IoTdataStream.end();
  })