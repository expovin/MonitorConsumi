const mariadb = require('mariadb');
console.log(process.env.NODE_ENV);
const settings = require('./settings.'+process.env.NODE_ENV);

function pad(num,size) {
    var s = String(num);
    while (s.length < (size || 2)) {s = "0" + s;}
    return s;
}

class REPO {

    constructor() {
        this.conn;
        this.festivi=[];
        this.pasquette=[];
        this.tariffe=[];
    }

    init(){
        const pool = mariadb.createPool(settings.mariaDb);
        return new Promise((fulfill, reject) => {
            pool.getConnection()
            .then ( conn => {
                this.conn=conn;
                fulfill("OK");
            })
            .catch( error => reject("Error connecting to MariaDb :"+error))   
        })
    }

    listaGiorniFestivi() { return this.festivi}
    listaPasquette() {return this.pasquette}
    listaTariffe() {return this.tariffe}

    recuperaGiorniFestivi(){
        console.log("[recuperaGiorniFestivi]")
        return new Promise( (fulfill, reject) => {
            let sql = "select * from GiorniFestivi"
            this.conn.query(sql)
                .then( result => {

                    this.festivi=result;
                    fulfill({success:true, data:result})
                })
                .catch( error => {
                    //this.init();
                    console.log(error)
                })                          
        })            
    }

    recuperaPasquette(){
        console.log("[recuperaPasquette]")
        return new Promise( (fulfill, reject) => {
            let sql = "select * from Pasquette"
            this.conn.query(sql)
                .then( result => {
                    let data = result.map(e => {
                        let d = new Date(e.Giorno);
                        let month = '' + (d.getMonth() + 1);
                        let day = '' + d.getDate();
                        let year = d.getFullYear();    
                        
                        let giorno = [year, pad(month,2), pad(day,2)].join('-');
                        e['strG']=giorno;
                        return e
                    })
                    this.pasquette=data;
                    fulfill({success:true, data:data})
                })
                .catch( error => {
                    //this.init();
                    console.log(error)
                })                          
        })           
    }

    recuperaTariffe(){
        console.log("[recuperaTariffe]")
        return new Promise( (fulfill, reject) => {
            let sql = "select * from EnergyBandsByTime"
            this.conn.query(sql)
                .then( result => {
                    this.tariffe=result;
                    fulfill({success:true, data:result})
                })
                .catch( error => {
                    //this.init();
                    console.log(error)
                })                          
        })            
    }    

    ritornaTariffa(giorno, ora){  
        return this.tariffe.find(e => e.GiornoNum === parseInt(giorno) && e.Ora === parseInt(ora) )         
    }

    isFestivo(giorno){
        let d = new Date(giorno);
        let month = '' + (d.getMonth() + 1);
        let day = '' + d.getDate();

        let key = [pad(month,2), pad(day,2)].join('-');
        return (this.festivi.find(e => e.Giorno === key))
    }

    isPasquetta(giorno){
        return (this.pasquette.find(e => e.strG === giorno))
    }

    recuperaEnergiaSpesaPerFascia(fascia, device){
        let d = new Date();
        let month = '' + (d.getMonth() + 1);
        let day = '' + d.getDate();
        let year = d.getFullYear();

        let oggi = [year, pad(month,2), pad(day,2)].join('-');

        return new Promise( (fulfill, reject) => {
            let sql = "select "+fascia+" as W from EnergyConsumedByBand  \
                where Giorno='"+oggi+"' and device='"+device+"'"

            this.conn.query(sql)
                .then( result => fulfill({success:true, data:result[0], giorno:oggi}))
                .catch( error => {
                    //this.init();
                    //console.log(error)
                })                          
        })          
    }

    incrementaEnergiaSpesaPerFascia(data, fascia, device, nuovoValore){
        return new Promise( (fulfill, reject) => {
            let sql = "update EnergyConsumedByBand \
                    set "+fascia+"="+nuovoValore+" \
                    where Giorno='"+data+"' and device='"+device+"'"

            this.conn.query(sql)
                .then( result => fulfill({success:true, data:result[0]}))
                .catch( error => {
                    //this.init();
                    console.log(error)
                })                          
        })       
    }

    inserisciEnergiaSpesaPerFascia(fascia, device, nuovoValore){
        return new Promise( (fulfill, reject) => {
            let sql = "insert into EnergyConsumedByBand \
                    (Device, "+fascia+") \
                    values ('"+device+"','"+nuovoValore+"')"

            this.conn.query(sql)
                .then( result => fulfill({success:true, data:result[0]}))
                .catch( error => {
                    //this.init();
                    console.log(error)
                })                          
        })       
    }    

    incrementaPunti(dispositivo, progressivo, points){
        let d = new Date();
        let month = '' + (d.getMonth() + 1);
        let day = '' + d.getDate();
        let year = d.getFullYear();
        let hour = d.getHours();
        let minute  = d.getMinutes();
        let second = d.getSeconds();


        let oggi = [year, pad(month,2), pad(day,2)].join('-');
        let ora = [pad(hour,2), pad(minute,2), pad(second,2)].join(':')

        return new Promise( (fulfill, reject) => {
            let update = "UPDATE ConsumoEnergia \
                            set points="+(parseInt(points)+1)+", \
                            Ora='"+ora+"' \
                            where Giorno='"+oggi+"' and Dispositivo='"+dispositivo+"' and Progressivo="+progressivo

            this.conn.query(update)
                .then( result => fulfill({success:true, data:result}))
                .catch( error => {
                    //this.init();
                    console.log(error)
                })                          
        })
    }

    updLetturaTotale(power,id, avg2, avg92, avg182){

        return new Promise((fulfill,reject) => {
            let oraPrec;
            let select = "Select timestamp from `_RecordTotale` WHERE id="+id
            let updt = "UPDATE `_RecordTotale` \
                        SET `timestamp`=current_timestamp(), Potenza="+power+
                        ",AvgMin2="+avg2+", AvgMin92="+avg92+",AvgMin182="+avg182+" WHERE id="+id

            this.conn.query(select)
            .then( result => {
                oraPrec=result[0].timestamp;
                return this.conn.query(updt)
            })                                     
            .then( result => fulfill({success:true, data:result, OraPrec:oraPrec}))
            .catch( error => console.log(error))              
        })
    }

    addLettura(dispositivo, data, ultimaLettura) {

        return new Promise( (fulfill, reject) => {
            let insert="";
            if(ultimaLettura !== undefined && ultimaLettura.data !== undefined && ultimaLettura.data.Progressivo !== undefined)
                insert = "INSERT INTO ConsumoEnergia \
                                (Dispositivo, power, voltage, `current`,Progressivo) \
                                VALUES('"+dispositivo+"', "+data.Power+", "+data.Voltage+", "+data.Current+","+(parseInt(ultimaLettura.data.Progressivo)+1)+")"
            else            
                insert = "INSERT INTO ConsumoEnergia \
                                (Dispositivo, power, voltage, `current`) \
                                VALUES('"+dispositivo+"', "+data.Power+", "+data.Voltage+", "+data.Current+")"

            this.conn.query(insert)
                .then( result => fulfill({success:true, data:result}))
                .catch( error => {
                    //this.init();
                    console.log(error)
                })                          
        })
    }    

    ultimaLettura(dispositivo){
        let d = new Date();
        let month = '' + (d.getMonth() + 1);
        let day = '' + d.getDate();
        let year = d.getFullYear();

        let oggi = [year, pad(month,2), pad(day,2)].join('-');

        return new Promise( (fulfill, reject) => {
            let sql = "select * from ConsumoEnergia ce \
                        where Dispositivo ='"+dispositivo+"' and Giorno='"+oggi+"' \
                        and Progressivo = (select max(Progressivo) from ConsumoEnergia \
                        where Dispositivo='"+dispositivo+"' and Giorno='"+oggi+"')"

            //console.log(sql);
            this.conn.query(sql)
                .then( result => fulfill({success:true, data:result[0]}))
                .catch( error => {
                    //this.init();
                    console.log(error)
                })                          
        })        
    }
   
}

module.exports = REPO;
