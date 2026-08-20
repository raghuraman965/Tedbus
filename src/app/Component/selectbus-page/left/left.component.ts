import { Component } from '@angular/core';

@Component({
  selector: 'app-left',
  templateUrl: './left.component.html',
  styleUrl: './left.component.css'
})
export class LeftComponent {
  amenityIcon:{[key:string]: string}={
    'classic.amenities.wifi': 'wifi',
    'classic.amenities.waterBottle': 'local_drink',
    'classic.amenities.blankets': 'hotel',
    'classic.amenities.chargingPoint': 'battery_charging_full',
    'classic.amenities.movie': 'movie',
  }
  sidefiltervalues:any={
    livetracking:false,
    reschedulable:false,
    departuretime:{
      "search.buckets.before6am":false,
      "search.buckets.6amTo12pm": false,
      "search.buckets.12pmTo6pm": false,
      "search.buckets.after6pm": false,
    },
    bustype:{
      "search.types.standard":false,
      "search.types.sleeper":false,
      "search.types.acSeater":false,
      "search.types.nonAc":false,
    },
    arrivaltime:{
      "search.buckets.before6am":false,
      "search.buckets.6amTo12pm": false,
      "search.buckets.12pmTo6pm": false,
      "search.buckets.after6pm": false,
    },
    amenities:{
      "classic.amenities.wifi":false,
      "classic.amenities.waterBottle":false,
      "classic.amenities.blankets":false,
      "classic.amenities.chargingPoint":false,
      "classic.amenities.movie":false,
    },
  }
  getobjectkey(obj:any):string[]{
    return Object.keys(obj);
  }

  handlelivetrackingclick(): void{
    this.sidefiltervalues.livetracking=!this.sidefiltervalues.livetracking
  }
  handlerescheduleclick():void{
    this.sidefiltervalues.reschedulable=!this.sidefiltervalues.reschedulable
  }
  handledeparturetimeclick(event:any,name:string):void{
    this.sidefiltervalues.departuretime[name]=event.target.checked;
  }
  handlearivaltimeclick(event:any,name:string):void{
    this.sidefiltervalues.arrivaltime[name]=event.target.checked;
  }
  handlebustypeclick(event:any,name:string):void{
    this.sidefiltervalues.bustype[name]=event.target.checked;
  }
}
