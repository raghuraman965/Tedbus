import { Component } from '@angular/core';

interface FooterColumn {
  titleKey: string;
  linkKeys: string[];
}

@Component({
  selector: 'app-premium-footer',
  templateUrl: './premium-footer.component.html',
  styleUrls: ['./premium-footer.component.css']
})
export class PremiumFooterComponent {
  columns: FooterColumn[] = [
    { titleKey: 'footer.topRtc', linkKeys: ['footer.apsrtc', 'footer.gsrtc', 'footer.msrtc', 'footer.tnstc', 'footer.viewAll'] },
    { titleKey: 'footer.others', linkKeys: ['footer.tsrtc', 'footer.sbstc', 'footer.rsrtc', 'footer.keralaRtc', 'footer.viewAll'] },
    { titleKey: 'footer.topBusRoutes', linkKeys: ['footer.hydBlr', 'footer.blrChennai', 'footer.puneBlr', 'footer.mumbaiBlr', 'footer.viewAll'] },
    { titleKey: 'footer.topCities', linkKeys: ['footer.hydTickets', 'footer.blrTickets', 'footer.chennaiTickets', 'footer.puneTickets', 'footer.viewAll'] },
    { titleKey: 'footer.tedRail', linkKeys: ['footer.bookTrain', 'footer.pnrStatus', 'footer.liveTrainStatus', 'footer.trainSeatAvailability', 'footer.trainsBetweenStations'] }
  ];

  aboutColumns: FooterColumn[] = [
    { titleKey: 'footer.aboutTedBus', linkKeys: ['footer.aboutUs', 'footer.investorRelations', 'footer.contactUs', 'footer.mobileVersion', 'footer.sitemap', 'footer.offers', 'footer.careers', 'footer.values'] },
    { titleKey: 'footer.info', linkKeys: ['footer.tnc', 'footer.privacyPolicy', 'footer.faq', 'footer.blog', 'footer.busOperatorRegistration', 'footer.agentRegistration', 'footer.insurancePartner', 'footer.userAgreement'] },
    { titleKey: 'footer.globalSites', linkKeys: ['footer.india', 'footer.singapore', 'footer.malaysia', 'footer.indonesia', 'footer.peru', 'footer.colombia'] },
    { titleKey: 'footer.ourPartners', linkKeys: ['footer.goibiboBus', 'footer.goibiboHotels', 'footer.mmtBus', 'footer.mmtHotels'] }
  ];

  socialLinks: { icon: string; labelKey: string }[] = [
    { icon: 'facebook', labelKey: 'footer.facebook' },
    { icon: 'alternate_email', labelKey: 'footer.x' },
    { icon: 'photo_camera', labelKey: 'footer.instagram' },
    { icon: 'smart_display', labelKey: 'footer.youtube' }
  ];

  currentYear = new Date().getFullYear();
}
