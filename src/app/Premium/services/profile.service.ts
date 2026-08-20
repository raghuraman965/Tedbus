import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { url } from '../../config';

export interface ProfileAddress {
  street: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  relation: string;
}

export interface TravelPreferences {
  seatType: string;
  busType: string;
  language: string;
  notifications: boolean;
}

export interface ProfileData {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  gender?: string;
  dateOfBirth?: string;
  age?: number;
  bio?: string;
  location?: string;
  profilePicture?: string;
  preferredLanguage?: string;
  alternatePhone?: string;
  address?: ProfileAddress;
  emergencyContact?: EmergencyContact;
  travelPreferences?: TravelPreferences;
  token?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private apiUrl = url + 'profile';

  constructor(private http: HttpClient) {}

  private authHeaders(): HttpHeaders {
    let token = '';
    try {
      const raw = sessionStorage.getItem('Loggedinuser');
      if (raw) token = (JSON.parse(raw) as any)?.token || '';
    } catch { token = ''; }
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  getProfile(): Observable<ProfileData> {
    return this.http.get<ProfileData>(this.apiUrl, { headers: this.authHeaders() });
  }

  updateProfile(data: Partial<ProfileData>): Observable<ProfileData> {
    return this.http.put<ProfileData>(this.apiUrl, data, { headers: this.authHeaders() });
  }

  uploadPhoto(file: File): Observable<{ profilePicture: string }> {
    const formData = new FormData();
    formData.append('profilePhoto', file);
    return this.http.post<{ profilePicture: string }>(
      this.apiUrl + '/photo',
      formData,
      { headers: this.authHeaders() }
    );
  }

  savePhoto(profilePicture: string): Observable<ProfileData> {
    return this.http.post<ProfileData>(
      this.apiUrl + '/photo/save',
      { profilePicture },
      { headers: this.authHeaders() }
    );
  }
}
