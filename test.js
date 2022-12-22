const hlp = require('./helper');
/*

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

  })
*/

hlp.sendWebHookToHomeAssistant("W92","Consumi sopra la media, possibile distacco corrente nelle prossime 2 ore.");