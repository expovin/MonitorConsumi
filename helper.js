
console.log(process.env.NODE_ENV)
const fs = require('fs');
const fetch = require('node-fetch');
const settings = require('./settings.'+process.env.NODE_ENV);

module.exports = {


    saveDataToFile : function (P){
        console.log("Salvataggio dati su File");
        let Last2MinStr = JSON.stringify(P.getLast2Min())
        let Last92MinStr = JSON.stringify(P.getLast92Min())
        let Last182MinStr = JSON.stringify(P.getLast182Min())
    
        console.log("Scrivo su file Last2Min : "+Last2MinStr);
        
        fs.writeFileSync("data/getLast2Min.bin",Last2MinStr,"utf8");
        fs.writeFileSync("data/getLast92Min.bin",Last92MinStr,"utf8");
        fs.writeFileSync("data/getLast182Min.bin",Last182MinStr,"utf8");
    },


    getDataFromFile : function (P){
        console.log("RECUPERO DATI DA FILE");   
        try {
            if (fs.existsSync("data/getLast2Min.bin")) {
              let Last2Min = fs.readFileSync("data/getLast2Min.bin");
              let Last2MinData = JSON.parse(Last2Min);
              console.log("Letto file Last2Min, carico "+Last2MinData.length+" elementi");
              P.setLast2Min(Last2MinData);
              console.log("Messaggi attualmente caricati "+P.getLast2Min().length)
            }
          } catch(err) {
            console.error("File Last2Min non trovato, reinizzializzo : "+err)
        }

        try {
            if (fs.existsSync("data/getLast92Min.bin")) {
              let Last92Min = fs.readFileSync("data/getLast92Min.bin");
              let Last92MinData = JSON.parse(Last92Min);
              console.log("Letto file Last92Min, carico "+Last92MinData.length+" elementi");
              P.setLast92Min(Last92MinData);
              console.log("Messaggi attualmente caricati "+P.getLast92Min().length)
            }
          } catch(err) {
            console.error("File Last92Min non trovato, reinizzializzo : "+err)
        }
        
        try {
            if (fs.existsSync("data/getLast182Min.bin")) {
              let Last182Min = fs.readFileSync("data/getLast182Min.bin");
              let Last182MinData = JSON.parse(Last182Min);
              console.log("Letto file Last182Min, carico "+Last182MinData.length+" elementi");
              P.setLast182Min(Last182MinData);
              console.log("Messaggi attualmente caricati "+P.getLast182Min().length)
            }
          } catch(err) {
            console.error("File Last182Min non trovato, reinizzializzo : "+err)
        }        
    },

    exitProcess : function(IoTdataStream) {
        console.log("Termina esecuzione client");
        IoTdataStream.end()
        process.exit(1);
    },
    
    
    
    command : function(topic, message, P, IoTdataStream) {
        console.log("Comando : "+message);
    
        let topicDet=topic.split("/");
        let target = topicDet[1];
        
        if(target === "client" && message.toString() === "STOP"){
            this.saveDataToFile(P);
            this.exitProcess(IoTdataStream);        
        }
    
        if(target === "client" && message.toString() === "SAVE_DATA"){
            this.saveDataToFile(P);
        }    

        if(target === "client" && message.toString() === "GET_AVGQUEUE"){
          let data = P.getQueueFillingStatus();
          IoTdataStream.publish('comando/'+topicDet[2]+'/2min',JSON.stringify(data));
        }         
            
    },

    recuperaTariffa : function(repo){
        let d = new Date();
        let n = d.getDay();
    
        if( n === 0  ||                                         // Di domenica
            repo.isFestivo(process.argv[2]) !== undefined ||    // Giornata festiva fissa
            repo.isPasquetta(process.argv[2]) !== undefined     // Pasquetta
            )
            return("F3");
        else {                                                  // Giorno Feriale, ritorno 
            let ora=d.getHours();                                // la tariffa oraria
            return(repo.ritornaTariffa(n,ora).Fascia)
        }     
    },

    sendWebHookToHomeAssistant : function(code, message) {
      //http://192.168.0.151:8123/api/webhook/-Fwzh6OK0JKSzQZtv5wSbLDum
      return new Promise((fulfill, reject) => {

        let webhook = settings.HomeAssistant.codes[code] || settings.HomeAssistant.codes.default;

        let uri = settings.HomeAssistant.url+
                  settings.HomeAssistant.webhookUri +
                  webhook;

        let body = {code : code, message:message}

        console.log("Uri : "+uri);
        console.log(body);

        fetch(  uri , {
            "headers": {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            "body":  JSON.stringify(body),
            "method": "POST"
          })
          .then(res => res.text())
          .then(result => {
            console.log("Finito!!!");
            console.log(result)
            fulfill("done")
          })
          .catch(error => {
            console.log("Errore!")
            console.error(error);
            reject(error)
          });
      }) 
    },

    getPow2RowData : function(device) {

      //console.log("Seding request to "+settings.devices[device].url)
        return new Promise((fulfill, reject) => {
            fetch(settings.devices[device].url, {
                "headers": {
                  "accept": "*/*",
                  "accept-language": "en-US,en;q=0.9,it;q=0.8,it-IT;q=0.7"
                },
                "referrer": settings.devices[device].url,
                "referrerPolicy": "strict-origin-when-cross-origin",
                "body": null,
                "method": "GET",
                "mode": "cors"
              })
              .then(res => res.text())
              .then(body => {
                  let dict={};      
                  let stato;
                  let fine = body.indexOf("</table>")
                  if(fine === -1) fine=body.length;
                  let inizio  = body.substr(0,fine);
                  let appendice = body.substr(fine,body.length);
                  if(appendice.indexOf("OFF") === -1)
                    stato="ON"
                  else
                    stato="OFF"           
                  
                  let data=inizio.replace("{t}{s}","").split("{e}{s}")
                  data = data.map(e => {
                      dict[e.split("{m}")[0]]=parseFloat(e.split("{m}")[1])
                      return e
                  })
                  dict['stato']=stato;
                  fulfill(dict)            
                })
               .catch(error => reject(error));
        }) 
     },

     sendEmail : function(data) {
      let prepend="";
      if(process.env.NODE_ENV === "development")
          prepend=" ------- DEVELOPMENT -----  "
      data.emailFrom = settings.email.sender;
      data.emailTo  = settings.email.recipients.join();
      data.emailSubject = prepend+data.emailSubject;
      data.emailBody=prepend + "\n\n " + data.text;
      return new Promise((fulfill, reject) =>{
          fetch("http://"+settings.email.host+":"+settings.email.port+"/service/email", {
              "headers": {
                  'Content-Type': 'application/json'
              },            
              "referrerPolicy": "no-referrer-when-downgrade",
              "body": JSON.stringify(data),
              "method": "POST",
              "mode": "cors"
            })
            .then(res => res.text())
            .then(body => {
                  fulfill(body)
            })    
            .catch(err => reject(toJSON(err)))         
      })         
  }     



}