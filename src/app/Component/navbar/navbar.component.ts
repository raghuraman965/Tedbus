import { Component, OnInit } from '@angular/core';
declare var google:any;
import { CustomerService } from '../../service/customer.service';
import { Customer } from '../../model/customer.model';
import { Router } from '@angular/router';
import { AuthService } from '../../Premium/services/auth.service';
import { HttpClient } from '@angular/common/http';
import { url } from '../../config';
@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent implements OnInit{
constructor(private router:Router,private customerservice:CustomerService,private authService:AuthService,private http:HttpClient){}
isloggedIn:boolean=false
ngOnInit(): void {
  if(this.authService.isLoggedIn){
    this.isloggedIn=true
  }else{
    this.isloggedIn=false
  }


  google.accounts.id.initialize({
    client_id:"129421237209-jricn8ed4fgld4glk6k716deq5ebsmpb.apps.googleusercontent.com",
    callback:(response:any)=>{this.handlelogin(response);

    }
  })
}
ngAfterViewInit():void{
  this.rendergooglebutton();
}
private rendergooglebutton():void{
  const googlebtn=document.getElementById('google-btn');
  if(googlebtn){
    google.accounts.id.renderButton(googlebtn,{
      theme:'outline',
      size:'medium',
      shape:'pill',
      width:150,
    })
  }
}

handlelogin(response:any){
  this.http.post<any>(url + 'auth/google-login', { credential: response.credential }).subscribe({
    next:(res)=>{
      if(res && res.customer && res.token){
        const user = { ...res.customer, token: res.token };
        this.authService.persistGoogleUser(user, true);
        this.isloggedIn = true;
        this.router.navigate(['/']);
      }
    },
    error:(error)=>{
      console.error('Google login failed', error);
    }
  })
}
handlelogout(){
  google.accounts.id.disableAutoSelect();
  this.authService.logout();
  window.location.reload()
}
navigate(route:string){
  this.router.navigate([route])
}
}
