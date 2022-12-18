console.log(process.env.NODE_ENV);
const settings = require('./settings.'+process.env.NODE_ENV);

class Potenza {

    constructor() {
        this.Last2Mins=[],
        this.Last92Mins=[],
        this.Last182Mins=[];    
        this.ultimoTimestamp=0;
        this.Media2Mins=0;
        this.Media92Mins=0;
        this.Media182Mins=0;
    }

    accoda(lettura) {
        let now = new Date();

        // Rimuovo letture piu vecchie di 2, 92 e 182 Minuti rispettivamente
        this.Last2Mins   = this.Last2Mins.filter  (lettura => now - lettura.timestamp < settings.tempiMedia.Soglia1);
        this.Last92Mins  = this.Last92Mins.filter (lettura => now - lettura.timestamp < settings.tempiMedia.Soglia2);
        this.Last182Mins = this.Last182Mins.filter(lettura => now - lettura.timestamp < settings.tempiMedia.Soglia3);

        //Calcolo il tempo trascorso dall'ultima lettura se inferiore alla soglia
        let t = now - this.ultimoTimestamp;

        // Aggiorno il timestamp attuale
        this.ultimoTimestamp=now;

        //Accodo le letture
        let letturaAttuale = {
            timestamp: now,
            lettura:lettura,
            t:t
        }
        this.Last2Mins.push(letturaAttuale);
        this.Last92Mins.push(letturaAttuale);
        this.Last182Mins.push(letturaAttuale);

        //Calcolo la media per ogni Array
        this.Media2Mins = this.calcolaMedia(this.Last2Mins);
        this.Media92Mins = this.calcolaMedia(this.Last92Mins);
        this.Media182Mins = this.calcolaMedia(this.Last182Mins);

    }

    calcolaMedia(elementi) {
        let PotenzaTotale=0;
        let Tempo=0;

        elementi.forEach(element => {
            PotenzaTotale+=element.lettura * element.t;
            Tempo+=element.t;
        })
        return(PotenzaTotale/Tempo);
    }

    getLast2Min() { return this.Last2Mins }
    getLast92Min() { return this.Last92Mins }
    getLast182Min() { return this.Last182Mins }

    getLastValue() {return this.Last182Mins[this.Last2Mins.length].lettura}

    setLast2Min(dati) {
        this.Last2Mins = dati.map(e => {
            e.timestamp = new Date(Date.parse(e.timestamp))
            return(e);
        })        
    } 

    setLast92Min(dati) {
        this.Last92Mins = dati.map(e => {
            e.timestamp = new Date(Date.parse(e.timestamp))
            return(e);
        })
    } 
    setLast182Min(dati) {
        this.Last182Mins = dati.map(e => {
            e.timestamp = new Date(Date.parse(e.timestamp))
            return(e);
        })        
    } 

    getLast2MinAvg()   { return this.Media2Mins }
    getLast92MinAvg()  { return this.Media92Mins }
    getLast182MinAvg() { return this.Media182Mins }

    getQueueFillingStatus() {
        let d = new Date();
        let l2md = new Date(this.Last2Mins[0].timestamp);
        let l92md = new Date(this.Last92Mins[0].timestamp);
        let l182md = new Date(this.Last182Mins[0].timestamp);

        let data = {
          l2min : {
            num: this.Last2Mins.length,
            oldest : this.Last2Mins[0].timestamp,
            full: Math.ceil((d - l2md) / settings.tempiMedia.Soglia1 * 100)
          },
          l92min : {
            num : this.Last92Mins.length,
            oldest : this.Last92Mins[0].timestamp,
            full: Math.ceil((d - l92md) / settings.tempiMedia.Soglia2 * 100)
          },
          l182min : {
            num : this.Last182Mins.length,
            oldest : this.Last182Mins[0].timestamp,
            full: Math.ceil((d - l182md) / settings.tempiMedia.Soglia3 * 100)
          }  
        }
        
        return(data);
    }

}

module.exports = Potenza;