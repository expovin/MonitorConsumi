
console.log(process.env.NODE_ENV);
const settings = require('./settings.'+process.env.NODE_ENV);
const hlp = require('./helper');

/**
 * In questo modulo sono definiti tutti i controlli sulla potenza utilizzata
 * dai singoli dispositivi o quella totale. 
 * I codici di ritorno definiscono il risultato del controllo, il chiamante 
 * prenderà le eventuali azioni. I codici di ritorno sono suddivisi in 3 diversi livelli
 *  1) 0 :   Il controllo ha avuto esito positivo, tutti i parametri sono nella norma,
 *              non va preso alcun provvedimento
 *  2) 1 :   Il controllo non è nei parametri, ma ancora al disotto della soglia di
 *              azione. In questo caso ci si limita ad avvertire con warning (email, messaggin, websocket)
 *  3) 2:   Il controllo e fuori dai parametri e va adottato un provvedimento di 
 *              per evitare che il contatori interrompa l'erogazione di corrente.
 */

 const ALL_OK=0
 const WARNING=1
 const ALERT=2

 let emailText, emailSubject;

function spegniCarico(IoTdataStream) {

    console.log("[Spegnimento Carico] - Controllo dispositivi attivi");
    let Promises=[];

    settings.priorityList.forEach(device => {
        Promises.push(hlp.getPow2RowData(device))
    })

    Promise.all(Promises)
    .then(results => {
        results.every((device,idx) =>{ 
            console.log("Check device "+settings.priorityList[idx]);
            if(device.Power > settings.devices[settings.priorityList[idx]].sogliaON){
                // device da spegnere.                
                
                emailText="Spengo "+settings.priorityList[idx]+". Utilizzare il monitor touch per riabilitare.";
                console.log(emailText);
                IoTdataStream.publish(  settings.devices[settings.priorityList[idx]].cmdOFF.topic,
                                        settings.devices[settings.priorityList[idx]].cmdOFF.msg );

                setTimeout(() => {
                    IoTdataStream.publish(  settings.devices[settings.priorityList[idx]].cmdON.topic,
                                            settings.devices[settings.priorityList[idx]].cmdON.msg );
                },settings.devices[settings.priorityList[idx]].TTON)

                //Invio Warning per spegnimento effettuato
                hlp.sendEmail({emailSubject:emailSubject, text:emailText})
                return false;
            }
            return true;
        })
    })
    .catch(error => console.log(error))
     
 }

module.exports = {


    // Controllo sul superamento di soglia istantaneo e a 2 Min
    superamentoSoglia(P, IoTdataStream, power){


        /**
         * I controlli sulle medie vengono fatti solo quando le code sono
         * piene.
         */
             
        let queueFillingStatus = P.getQueueFillingStatus();

        /**
         * Viene fatto il controllo su una soglia di sicurezza, prima che si arrivi
         * al distacco della forntura
         */
        if(queueFillingStatus.l182min.full > settings.SOGLIA_CODE){
            let P_Avg182Min = P.getLast182MinAvg();
            if(P_Avg182Min > settings.SOGLIA.BASSA){
                emailSubject="Superata soglia BASSA per potenza 182Min "+P_Avg182Min+"  Spengo carico";
                console.log(emailSubject);
                spegniCarico(IoTdataStream);
                return(true);
            }
        }

        /**
         * Al 92° minuto c'è il secondo controllo del contatore.
         * Nel caso venga superata la soglia ALTA (4.7KW), viengono prese azioni per
         * evitare l'interruzione dell'erogazione della corrente
         */
        if(queueFillingStatus.l92min.full > settings.SOGLIA_CODE){
            let P_Avg92Min = P.getLast92MinAvg();
            if(P_Avg92Min > settings.SOGLIA.ALTA){
                emailSubject="Superata soglia ALTA per potenza 92 Min "+P_Avg92Min+" Spengo carico"
                console.log(emailSubject);
                spegniCarico(IoTdataStream);
                return(true);
            }
        }

        /**
         * Controllo che la media a 2 min non superi una soglia di sicurezza
         * impostata a 4.4KWh. Perchè quando tale soglia raggiunge i 4.7KW il
         * contatore interrompe l'erogazione di corrente
         */
        if(queueFillingStatus.l2min.full > settings.SOGLIA_CODE) {
            let P_Avg2Min = P.getLast2MinAvg();
            if(P_Avg2Min > settings.SOGLIA.SICUREZZA){
                emailSubject="Superata soglia SICUREZZA per potenza 2Min "+P_Avg2Min+" Spengo carico"
                console.log(emailSubject);
                spegniCarico(IoTdataStream);
                return(true);
            }
        }

        /**
         * La potenza totale istantanea non dovrebbe mai superare i 14 KW
         * interruzione immediata del contatore. 
         * In questo caso controllo che non superi i 4,7KW [settings.SOGLIA.ALTA]
         * in queste condizioni il contatore scatta quando la media a 2 min la supera
         */        
         
        if(power > settings.SOGLIA.ALTA){
            emailSubject="Superata soglia ALTA per potenza istantanea "+power+" Spengo carico";
            console.log(emailSubject);
            spegniCarico(IoTdataStream);
            return(true);
        }
        
        /**
         * Nel caso la media a 92Min è ancora al di sopra della soglia base viene
         * inviato un WARNING
         */
        if(queueFillingStatus.l92min.full > settings.SOGLIA_CODE){
            if(P_Avg92Min > settings.SOGLIA.BASE){
                emailSubject="WARNING : Superata soglia BASE per potenza 92 Min "+P_Avg92Min
                emailText="Non è stat presa alcuna azione, se i consumi di energia rimarranno costanti nella\
                            prossima ora, il contatore potrebbe staccare l'erogazione di corrente."            
                console.log(emailSubject);
                hlp.sendEmail({emailSubject:emailSubject, text:emailText})
                return(true);
            } 
        }

        /**
         * Verifico che la potenza istantanea non superi la soglia base di 3.3KWh
         * nel qual caso invio solo un warning
         */
        if(power > settings.SOGLIA.BASE){            
            emailSubject="WARNING : Superata soglia BASE per potenza Istantanea "+power
            emailText="Non è stat presa alcuna azione, se i consumi di energia rimarranno costanti nelle\
                        prossime 2 ore, il contatore potrebbe staccare l'erogazione di corrente."
            console.log(emailSubject);
            //hlp.sendEmail({emailSubject:emailSubject, text:emailText})
            return(true)
        }
            
    /**
     * Se tutti i controlli precedenti vanno a buon fine ritorno ALL_OK
     */
        return(false)
    },

    /**
     * La lavatrice e asciugatrice non dovrebbero mai funzionare contemporaneamente
     * dal momento che sono entrambe connesse alla stessa presa di corrente dimensionata
     * per un solo elettrodomestico.
     * Nel caso siano entrambe accese, spengo l'asciugatrice.
     */

    lavanderia(IoTdataStream){
        let Promises=[];

        settings.priorityList.forEach(device => {
            Promises.push(hlp.getPow2RowData(device))
        })

        Promise.all(Promises)
        .then(results => {

            if( results[1].Power > settings.devices[settings.lavanderiaPriority[0]].sogliaON &&
                results[2].Power > settings.devices[settings.lavanderiaPriority[1]].sogliaON
                ) {

                    emailSubject="Attenzione! Controllo carico";
                    emailText="Lavatrice e assciugatrice contemporaneamente accese. Spengo "+settings.lavanderiaPriority[0];
                    console.log(emailText);
                    hlp.sendEmail({emailSubject:emailSubject, text:emailText});

                    IoTdataStream.publish(  settings.devices[settings.lavanderiaPriority[0]].cmdOFF.topic,
                                            settings.devices[settings.lavanderiaPriority[0]].cmdOFF.msg );
    
                    setTimeout(() => {
                        IoTdataStream.publish(  settings.devices[settings.lavanderiaPriority[0]].cmdON.topic,
                                                settings.devices[settings.lavanderiaPriority[0]].cmdON.msg );
                    },settings.devices[settings.lavanderiaPriority[0]].TTON)
                    return true
                }
                return false
            
        })
        .catch(error => console.log(error))

    }



}