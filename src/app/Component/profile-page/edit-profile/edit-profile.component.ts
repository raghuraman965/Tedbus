import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateService } from '@ngx-translate/core';
import { ProfileService, ProfileData } from '../../../Premium/services/profile.service';
import { AuthService, AuthUser } from '../../../Premium/services/auth.service';
import { resolveImageUrl } from '../../../Premium/utils/image-fallback';

@Component({
  selector: 'app-edit-profile',
  templateUrl: './edit-profile.component.html',
  styleUrls: ['./edit-profile.component.css']
})
export class EditProfileComponent implements OnInit {
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  profileForm!: FormGroup;
  loading = false;
  uploadingPhoto = false;
  photoPreview: string | null = null;
  selectedFile: File | null = null;
  originalProfile: ProfileData | null = null;
  successMessage = '';
  errorMessage = '';

  genderOptions = [
    { value: '', label: 'editProfile.genderNotSpecified' },
    { value: 'male', label: 'editProfile.genderMale' },
    { value: 'female', label: 'editProfile.genderFemale' },
    { value: 'other', label: 'editProfile.genderOther' },
    { value: 'prefer_not_to_say', label: 'editProfile.genderPreferNotToSay' }
  ];

  seatTypes = [
    { value: '', label: 'editProfile.any' },
    { value: 'window', label: 'editProfile.window' },
    { value: 'aisle', label: 'editProfile.aisle' },
    { value: 'lower', label: 'editProfile.lower' },
    { value: 'upper', label: 'editProfile.upper' }
  ];

  busTypes = [
    { value: '', label: 'editProfile.any' },
    { value: 'ac', label: 'editProfile.ac' },
    { value: 'non_ac', label: 'editProfile.nonAc' },
    { value: 'sleeper', label: 'editProfile.sleeper' },
    { value: 'seater', label: 'editProfile.seater' }
  ];

  languages = [
    { value: '', label: 'editProfile.any' },
    { value: 'en', label: 'editProfile.langEnglish' },
    { value: 'hi', label: 'editProfile.langHindi' },
    { value: 'ta', label: 'editProfile.langTamil' },
    { value: 'te', label: 'editProfile.langTelugu' },
    { value: 'kn', label: 'editProfile.langKannada' },
    { value: 'ml', label: 'editProfile.langMalayalam' }
  ];

  constructor(
    private fb: FormBuilder,
    private profileService: ProfileService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.profileForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      gender: [''],
      dateOfBirth: [''],
      age: ['', [Validators.min(1), Validators.max(150)]],
      phone: ['', [Validators.pattern(/^\+?[\d\s\-()]{7,15}$/)]],
      alternatePhone: ['', [Validators.pattern(/^\+?[\d\s\-()]{7,15}$/)]],
      bio: ['', [Validators.maxLength(500)]],
      location: ['', [Validators.maxLength(200)]],
      address: this.fb.group({
        street: [''],
        city: [''],
        state: [''],
        pincode: ['', [Validators.pattern(/^\d{4,10}$/)]],
        country: ['']
      }),
      emergencyContact: this.fb.group({
        name: [''],
        phone: ['', [Validators.pattern(/^\+?[\d\s\-()]{7,15}$/)]],
        relation: ['']
      }),
      travelPreferences: this.fb.group({
        seatType: [''],
        busType: [''],
        language: [''],
        notifications: [true]
      })
    });

    this.loadProfile();
  }

  loadProfile(): void {
    this.loading = true;
    this.profileService.getProfile().subscribe({
      next: (profile) => {
        this.originalProfile = profile;
        this.populateForm(profile);
        this.loading = false;
      },
      error: () => {
        const user = this.authService.currentUser;
        if (user) {
          this.populateFormFromAuth(user);
        }
        this.loading = false;
      }
    });
  }

  populateForm(profile: ProfileData): void {
    this.profileForm.patchValue({
      name: profile.name || '',
      gender: profile.gender || '',
      dateOfBirth: profile.dateOfBirth || '',
      age: profile.age || '',
      phone: profile.phone || '',
      alternatePhone: profile.alternatePhone || '',
      bio: profile.bio || '',
      location: profile.location || '',
      address: {
        street: profile.address?.street || '',
        city: profile.address?.city || '',
        state: profile.address?.state || '',
        pincode: profile.address?.pincode || '',
        country: profile.address?.country || ''
      },
      emergencyContact: {
        name: profile.emergencyContact?.name || '',
        phone: profile.emergencyContact?.phone || '',
        relation: profile.emergencyContact?.relation || ''
      },
      travelPreferences: {
        seatType: profile.travelPreferences?.seatType || '',
        busType: profile.travelPreferences?.busType || '',
        language: profile.travelPreferences?.language || '',
        notifications: profile.travelPreferences?.notifications !== false
      }
    });
    this.photoPreview = resolveImageUrl(profile.profilePicture) || null;
  }

  populateFormFromAuth(user: AuthUser): void {
    this.profileForm.patchValue({
      name: user.name || '',
      phone: user.phone || ''
    });
    this.photoPreview = resolveImageUrl(user.profilePicture) || null;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    if (file.size > 5 * 1024 * 1024) {
      this.snackBar.open(
        this.translate.instant('editProfile.photoTooLarge'),
        this.translate.instant('editProfile.close'),
        { duration: 4000 }
      );
      return;
    }

    this.selectedFile = file;

    const reader = new FileReader();
    reader.onload = () => {
      this.photoPreview = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  removePhoto(): void {
    this.selectedFile = null;
    this.photoPreview = null;
  }

  onSubmit(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.successMessage = '';
    this.errorMessage = '';

    const formValue = this.profileForm.getRawValue();
    const updateData: Partial<ProfileData> = {};

    updateData.name = formValue.name;
    updateData.gender = formValue.gender;
    updateData.dateOfBirth = formValue.dateOfBirth;
    updateData.age = formValue.age;
    updateData.phone = formValue.phone;
    updateData.alternatePhone = formValue.alternatePhone;
    updateData.bio = formValue.bio;
    updateData.location = formValue.location;
    updateData.address = formValue.address;
    updateData.emergencyContact = formValue.emergencyContact;
    updateData.travelPreferences = formValue.travelPreferences;

    this.profileService.updateProfile(updateData).subscribe({
      next: (updatedProfile) => {
        this.originalProfile = updatedProfile;

        // Upload photo if a new one was selected
        if (this.selectedFile) {
          this.uploadPhotoAndSave(updatedProfile);
        } else if (this.photoPreview === null && this.originalProfile?.profilePicture) {
          // Photo was removed
          this.savePhotoUrl('');
        } else {
          this.onSaveComplete(updatedProfile);
        }
      },
      error: (err) => {
        this.loading = false;
        const msg = err.error?.error || this.translate.instant('editProfile.saveError');
        this.errorMessage = msg;
        this.snackBar.open(msg, this.translate.instant('editProfile.close'), { duration: 5000 });
      }
    });
  }

  private uploadPhotoAndSave(profile: ProfileData): void {
    if (!this.selectedFile) return;

    this.uploadingPhoto = true;
    this.profileService.uploadPhoto(this.selectedFile).subscribe({
      next: (res) => {
        this.savePhotoUrl(res.profilePicture);
      },
      error: (err) => {
        this.uploadingPhoto = false;
        this.loading = false;
        const msg = err.error?.error || this.translate.instant('editProfile.photoUploadError');
        this.snackBar.open(msg, this.translate.instant('editProfile.close'), { duration: 5000 });
      }
    });
  }

  private savePhotoUrl(photoUrl: string): void {
    this.profileService.savePhoto(photoUrl).subscribe({
      next: (updatedProfile) => {
        this.onSaveComplete(updatedProfile);
      },
      error: () => {
        this.loading = false;
        this.uploadingPhoto = false;
        this.snackBar.open(
          this.translate.instant('editProfile.saveSuccess'),
          this.translate.instant('editProfile.close'),
          { duration: 3000 }
        );
        this.updateSessionUser(this.originalProfile!);
        this.saved.emit();
      }
    });
  }

  private onSaveComplete(profile: ProfileData): void {
    this.loading = false;
    this.uploadingPhoto = false;
    this.successMessage = this.translate.instant('editProfile.saveSuccess');
    this.snackBar.open(this.successMessage, this.translate.instant('editProfile.close'), { duration: 3000 });
    this.updateSessionUser(profile);
    this.saved.emit();
  }

  private updateSessionUser(profile: ProfileData): void {
    const currentUser = this.authService.currentUser;
    if (currentUser) {
      const updated: AuthUser = {
        ...currentUser,
        name: profile.name || currentUser.name,
        phone: profile.phone || currentUser.phone,
        gender: profile.gender || currentUser.gender,
        profilePicture: profile.profilePicture || currentUser.profilePicture
      };
      this.authService.updateUser(updated);
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  getFieldError(fieldPath: string): string {
    const parts = fieldPath.split('.');
    let control = this.profileForm.get(parts[0]);
    for (let i = 1; i < parts.length; i++) {
      control = control?.get(parts[i]) ?? null;
    }
    if (!control || !control.errors || !control.touched) return '';

    if (control.errors['required']) {
      return this.translate.instant('editProfile.fieldRequired');
    }
    if (control.errors['minlength']) {
      return this.translate.instant('editProfile.minLength', { min: control.errors['minlength'].requiredLength });
    }
    if (control.errors['maxlength']) {
      return this.translate.instant('editProfile.maxLength', { max: control.errors['maxlength'].requiredLength });
    }
    if (control.errors['min']) {
      return this.translate.instant('editProfile.minValue', { min: control.errors['min'].min });
    }
    if (control.errors['max']) {
      return this.translate.instant('editProfile.maxValue', { max: control.errors['max'].max });
    }
    if (control.errors['pattern']) {
      return this.translate.instant('editProfile.invalidFormat');
    }
    return '';
  }
}
