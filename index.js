console.log(process.env.NODE_ENV)

const mqtt = require('mqtt');
var fs = require('fs');
const Potenza = require('./Potenza');
const settings = require('./settings.'+process.env.NODE_ENV);
const db = require('./db');
const hlp = require('./helper');
let P = new Potenza();
const chk = require('./listaControlli');

const { exit } = require('process');

let repo = new db();
let IoTdataStream;
/**
 * Inizzializzazione Database e recupero dati
 */
repo.init()
.then( () => repo.recuperaGiorniFestivi())
.then( () => repo.recuperaPasquette() )
.then( () => repo.recuperaTariffe() )
.then( () => {

    IoTdataStream  = mqtt.connect(settings.MQTT.host,settings.MQTT)
    /**
     * Sottoscrizione coda MQTT
     */
    IoTdataStream.on('connect', function () {
        console.log("[Connected to IoTdataStream]");
        // Recupero eventuali dati salvati su file
        hlp.getDataFromFile(P);        
        
        IoTdataStream.subscribe(settings.topic.data, function (err) {        
        if (!err) {
            console.log("Sottoscrizione effettuata su topic ["+settings.topic.data+"]")        
        }
        else {
            console.log("Errore nella sottoscrizione.")
        }
        
        })
    })

    IoTdataStream.on('message', function (topic, message) {
        
        let topicDet = topic.split("/");
        switch(topicDet[0]){
            case "shellies" : 
                shelly(topic, message, IoTdataStream);    
                if(topicDet[3] == 0 && topicDet[4] === "power")
                    verificaSoglie(topicDet[0],P,message);            
                break;

            case "tele":
                powr2(topic, message);  
                verificaSoglie(topicDet[0],P,message);       
                
                break;

            case "comando":
                hlp.command(topic, message, P, IoTdataStream);
                break;

            default:
                //console.log("Topic non ancora gestito "+topic);
        }
    })

})
.catch(error => console.log("Errore : "+error))
/************************************** */



/**
 *  Controllo messaggi che arrivano dallo shelly nel quadro generale
 *
 *  
 */
 function shelly(topic, message, IoTdataStream){
     let topicDet=topic.split("/");
     let topicType=topicDet[2];
     let canale = topicDet[3];
     let misura = topicDet[4];

     if(topicType === "emeter" && misura ==="power"){
         switch(canale){
             case '0':
                P.accoda(message*-1);
                /**
                 * Aggiorno sul Bus lo stato delle code
                 */
                let q2Min = {Avg:P.getLast2MinAvg(), Nun:P.getQueueFillingStatus().l2min};
                let q92Min= {Avg:P.getLast92MinAvg(), Nun:P.getQueueFillingStatus().l92min};
                let q182Min={Avg:P.getLast182MinAvg(), Nun:P.getQueueFillingStatus().l182min};
                IoTdataStream.publish('shellies/energy/emeter/90/power/2Min',JSON.stringify(q2Min));
                IoTdataStream.publish('shellies/energy/emeter/90/power/92Min',JSON.stringify(q92Min))
                IoTdataStream.publish('shellies/energy/emeter/90/power/182Min',JSON.stringify(q182Min))

                repo.updLetturaTotale(message*-1,1, P.getLast2MinAvg(), P.getLast92MinAvg(), P.getLast182MinAvg())
                .then(result => {
                    let start = new Date(result.OraPrec);
                    let end = new Date();
                    let t = parseFloat((end-start)/1000);
                    if(t < settings.tempoSogliaLettura){
                        let fascia = hlp.recuperaTariffa(repo)
                        repo.recuperaEnergiaSpesaPerFascia(fascia,"TOTALE")
                        .then(result => {
                            if(result && result.data)
                                repo.incrementaEnergiaSpesaPerFascia(result.giorno,fascia,"TOTALE",result.data.W+ parseFloat(message*-1) * t /3600)        
                            else
                                repo.inserisciEnergiaSpesaPerFascia(fascia,"TOTALE", parseFloat(message*-1) * t / 3600)                    
                            })    
                    }                     
                })


                 break;

            case '1':
                repo.updLetturaTotale(message,2, 0, 0, 0)
                .then(result => {
                    let start = new Date(result.OraPrec);
                    let end = new Date();
                    let t = parseFloat((end-start)/1000);
                    if(t < settings.tempoSogliaLettura){
                        let fascia = hlp.recuperaTariffa(repo)
                        repo.recuperaEnergiaSpesaPerFascia(fascia,"CUCINA")
                        .then(result => {
                            if(result && result.data)
                                repo.incrementaEnergiaSpesaPerFascia(result.giorno,fascia,"CUCINA",result.data.W+ parseFloat(message) * t /3600)        
                            else
                                repo.inserisciEnergiaSpesaPerFascia(fascia,"CUCINA", parseFloat(message) * t / 3600)                    
                            })                         
                    }
                       
                })
                break;                 

            default:
                //console.log("Canale non ancora gestito ["+canale+"] : "+message.toString() )
         }         
     }

 }

 /**
  *  Controlli messaggi in arrivo dal Pow R2 SonOff
  *  (Lavatrice e Asciugatrice)
  *  
  */

 function powr2 (topic, message){
     let jMessage;
    try{
        jMessage = JSON.parse(message.toString());

        let topicDet = topic.split("/");
        let device = topicDet[1];
        let state = topicDet[2];
        if(state === "SENSOR"){
            if(jMessage.ENERGY.Power > 0){
                //console.log("Dispositivo attivo. Potenza istantanea "+jMessage.ENERGY.Power);

                getConsumoIstantaneo(device, jMessage.ENERGY)
                //.then(result => console.log(result))
                //.catch(error => console.log(error));

                if(settings.puntiIntermedi > 0){
                    // Richiamo metodo HTTP tra i polling MQTT ogni 10 sec.
                    
                    let count={};
                    count[device]=0;
                    let tempo = settings.MQTTfreq / (settings.puntiIntermedi + 1);      // Divido il tempo in parti euguali                        
                    let ciclo = setInterval(() => {
                        count[device]++;

                        hlp.getPow2RowData (device)
                        .then(result => {
                            //console.log(result);
                            getConsumoIstantaneo(device, result)
                        })
                        if(count[device] === settings.puntiIntermedi){
                            clearInterval(ciclo);
                        }                                                
                    }, tempo);     
                }
            }
        }
    } catch {
        console.log(message.toString());
    }   
 }





function getConsumoIstantaneo(device, data){

    //console.log("[getConsumoIstantaneo]")
    if(data.Power > settings.devices[device].sogliaON){
        return new Promise ((fulfill, reject) => {
            repo.ultimaLettura(device)
            .then( ultimaLettura => {
    
                if(ultimaLettura && ultimaLettura.data &&
                  parseFloat(ultimaLettura.data.power).toFixed(2) === parseFloat(data.Power).toFixed(2) &&
                  parseFloat(ultimaLettura.data.voltage).toFixed(2) === parseFloat(data.Voltage).toFixed(2) &&
                  parseFloat(ultimaLettura.data.current).toFixed(2) === parseFloat(data.Current).toFixed(2)){
                       //console.log("Lettura identica alla precedente, aumento points e aggiorno ora");
                       // Incrementa points
                       repo.incrementaPunti(device,ultimaLettura.data.Progressivo, ultimaLettura.data.points)
                   } else {
                       //console.log("Lettura differente, inserisco un nuovo record");
                       // Inserisci nuova lettura
                      repo.addLettura(device, data, ultimaLettura )
                   }
                   // Inserisco anche nella tabella per Fasce orarie
                   let fascia = hlp.recuperaTariffa(repo)
                   repo.recuperaEnergiaSpesaPerFascia(fascia,device)
                   .then(result => { 
    
                       let tempoSec=(settings.MQTTfreq/1000) / (settings.puntiIntermedi + 1);
                       
                      if(result && result.data)
                          repo.incrementaEnergiaSpesaPerFascia(result.giorno,fascia,device,result.data.W+ parseFloat(data.Power) * tempoSec /3600)        
                      else
                          repo.inserisciEnergiaSpesaPerFascia(fascia,device, parseFloat(data.Power) * tempoSec / 3600)                    
                  })
                   
                  fulfill(data)
            })   
            .catch(error => reject(error))
        })        
    } 

}

     /**
     * Questa funzione considera il valore istantaneo di potenza appena letta e le medie a
     * 2, 92 e 182 minuti per prendere eventuali decisioni di chiusura dispositivi per evitare
     * il distacco del contatore.
     * L'informazione viene ritornata al processo chiamante con lo stato attuale. Il processo 
     * chiamante si occuperà di spegnere i carichi e inviare le opportune notifiche.
     * tipo : TOTALE | LAVANDERIA
     *          - TOTALE : Verifica su nuovo valore da contatore Generale
     *          - LAVANDERIA : Verifica su nuovo valore da Lavatrice | Asciuigatrice (solo una in running)
     */
function verificaSoglie (tipo,P,power){

        switch(tipo){
            case 'shellies':  
                if( chk.superamentoSoglia(P, IoTdataStream, power*-1) //||
                    //chk.superamentoSoglia92Min(P,IoTdataStream) ||
                    //chk.superamentoSoglia182Min(P, IoTdataStream)
                    )  {
                        // Uni dei controlli è andato male.
                        // Azone gia eseguita. Qui posso loggare
                        console.log("[verificaSoglie] Soglia Superata.");
                    }                               

                break;

            case 'tele':              
                chk.lavanderia(IoTdataStream);
                break;

            default:
                //console.log("Tipo "+tipo+" non abilitato al controllo superamento soglia");
                break;
        }
}