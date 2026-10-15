# Testul pe telefon

Lista trece prin tot ce face demo-ul: întâi pe iPhone, apoi pe Android. Bifează fiecare punct pe măsură ce îl verifici.

**Ce îți trebuie:**

- iPhone cu iOS 16.4 sau mai nou (vezi în **Settings → General → About**);
- laptopul cu Chrome sau un al doilea telefon;
- un telefon Android, pentru a doua trecere;
- linkul aplicației (`https://<Project ID>.web.app`) și parolele celor 5 conturi, din ghidul de setup.

Ai nevoie de două dispozitive deodată: notificarea ajunge doar pe dispozitivul pe care e logat contul căruia îi e trimisă.

Dacă ceva nu merge, fă o captură de ecran și notează ora. Cu ele găsesc repede problema.

## 1. Instalarea

### iPhone

- [ ] Deschide linkul în **Safari** (nu din Chrome sau din aplicația Gmail). Pe ecranul **Sign in**, sub titlu, apare caseta „Add the app to your Home Screen”, cu 3 pași. Nu intra încă în cont: în Safari nu ai nevoie de el.
- [ ] Compară pașii din casetă cu ce vezi pe iPhone, în limba telefonului: butonul de partajare (pătratul cu săgeata în sus) și opțiunea **Add to Home Screen**. Pe iOS-urile noi, butonul poate fi ascuns în meniul **•••** din Safari, iar opțiunea poate fi mai jos în listă. Notează cum se numesc exact pe telefonul tău, ca să corectez textul dacă e altfel.
- [ ] Adaugă aplicația pe ecranul principal. Apare iconița **VM Report**.
- [ ] Deschide aplicația de pe iconiță. Se deschide pe tot ecranul, fără bara Safari, la ecranul **Sign in**, de data asta fără casetă.
- [ ] Intră cu contul Store (`+store850`). Sus apare butonul **Turn on notifications**.
- [ ] Apasă-l și permite notificările (**Allow**). Butonul dispare.

### Laptop (Chrome)

- [ ] Deschide linkul în Chrome și intră cu contul Head of VM (`+headofvm`).
- [ ] Apasă **Turn on notifications** și permite notificările. Dacă nu apare nicio notificare pe laptop mai târziu, verifică în setările Windows sau macOS că Chrome are voie să afișeze notificări.

### Android

- [ ] Deschide linkul în Chrome și intră în cont. După login apare butonul **Install app** (dacă nu apare, îl găsești în meniul ⋮: **Install app** sau **Add to Home screen**). Instalează aplicația; apare iconița.
- [ ] Deschide aplicația de pe iconiță. De obicei ești deja în cont, pentru că aplicația folosește aceeași sesiune ca Chrome; dacă vezi **Sign in**, intră din nou. Apasă **Turn on notifications** → **Allow**.

## 2. Ciclul complet: iPhone = Store, laptop = Head of VM

### Raportul

- [ ] iPhone: apasă **New report**, scrie un nume de campanie (de ex. „Test octombrie”) și apasă **Start report**. Apar cele 33 de zone, pe departamente.
- [ ] Deschide **Women's Image** → **Choose from gallery** și alege o poză făcută vertical. Miniatura apare dreaptă, nu culcată.
- [ ] La altă zonă apasă **Take photo** și fă o poză. Apare în zonă.
- [ ] O poză mare: dacă iPhone-ul face poze de 48 MP (iPhone 14 Pro sau mai nou), fă una la rezoluție maximă și urc-o la o zonă. În aplicația Camera e butonul **HEIF MAX** sus; dacă nu-l vezi, pornește **Settings → Camera → Formats → Resolution Control**. Poza se încarcă în câteva secunde, fără eroare, și apare dreaptă.
- [ ] La o zonă scrie un comentariu cu diacritice, de ex. „Mută manechinii în față și așază tricourile pe culori”. Apare „Saved”.
- [ ] Închide aplicația de tot (glisează-o în sus din lista de aplicații deschise) și deschide-o din nou. Ciorna e tot acolo, cu pozele și comentariul.
- [ ] Pune poze la 3–4 zone și marchează restul cu **Not part of this campaign**. În listă, fiecare zonă își arată statusul.
- [ ] **Send** devine activ abia când fiecare zonă are poză sau marcajul. Apasă **Send**.

### Feedbackul

- [ ] Laptop: în cel mult un minut vine notificarea „850 Palladium Praha sent a report: …”. Înainte să dai click, uită-te în lista de rapoarte: raportul are eticheta **New**. Apoi click pe notificare: se deschide raportul, iar eticheta **New** dispare. Dacă aplicația e deschisă pe ecran, notificarea apare jos, în aplicație, cu butonul **Open**.
- [ ] Laptop: poza verticală apare dreaptă și aici.
- [ ] Laptop: deschide Women's Image, apasă **Mark on photo** și desenează un cerc. Scrie feedbackul, alege ca deadline ziua de mâine și apasă **Send feedback**. Zona devine **Needs correction**.
- [ ] iPhone: în cel mult un minut vine notificarea „Feedback: Women's Image — deadline …”. Apasă pe ea: se deschide direct zona.
- [ ] iPhone: cercul e pe poză exact în locul în care l-ai desenat pe laptop.
- [ ] iPhone: pe ecranul principal, zona apare sus, la **Corrections to do**, cu deadline-ul.

### Corectura

- [ ] iPhone: în zonă adaugă o poză nouă, scrie un comentariu și apasă **Send correction**. Ajungi pe ecranul principal, iar zona dispare de la **Corrections to do**.
- [ ] Laptop: în cel mult un minut vine notificarea „850 Palladium Praha sent a correction: Women's Image”. Click pe ea: se deschide zona. Dacă aplicația e deschisă pe ecran, notificarea apare jos, în aplicație, cu butonul **Open**.
- [ ] Laptop: la **Before and after** vezi poza veche, cu cercul, lângă poza nouă.
- [ ] Laptop: apasă **Approve**. Pe iPhone vine notificarea „Approved: Women's Image”.
- [ ] Laptop: pe raport apasă **Approve all without feedback** și confirmă. Zonele care erau **Submitted** devin **Approved**. Pe iPhone vine o singură notificare pentru tot raportul.
- [ ] Laptop: deschide **Overview**. Magazinul apare cu pătrățele colorate pe departamente. Apasă un pătrățel: sub grilă apar numele zonei și statusul ei.

## 3. Ciclul invers: laptop = Store, iPhone = Head of VM

Aici testezi pe iPhone desenatul, notificările pentru Head of VM și PDF-ul.

- [ ] iPhone: **Settings** → **Log out**, apoi intră cu contul Head of VM. Dacă apare **Turn on notifications**, apasă-l.
- [ ] Laptop: ieși din Head of VM și intră cu contul Store.
- [ ] Laptop: fă un raport cu poze la toate cele 33 de zone (cu **Choose from gallery** poți lua orice poze de pe laptop). La câteva zone scrie comentarii cu diacritice românești și cehe, de ex. „Mută manechinii în față — přeskládat trička”. Apasă **Send**.
- [ ] iPhone: în cel mult un minut vine notificarea pentru raport. Apasă pe ea: se deschide raportul.
- [ ] iPhone: la o zonă apasă **Mark on photo** și desenează cu degetul. Pagina stă pe loc cât timp desenezi, nu derulează.
- [ ] iPhone: o atingere scurtă pe poză lasă un punct roșu. **Undo** șterge ultimul semn.
- [ ] iPhone: scrie feedbackul, alege deadline-ul din calendar și apasă **Send feedback**. Pe laptop vine notificarea, iar cercurile și punctul apar în același loc.
- [ ] Laptop: trimite corectura. Pe iPhone vine notificarea, iar **Before and after** arată poza veche cu cercuri lângă cea nouă. Apasă **Approve**.
- [ ] iPhone: dă feedback cu un cerc și la o a doua zonă, pe care n-o corectezi.
- [ ] iPhone: pe raport apasă **Export PDF**. Se deschide meniul de partajare (Save to Files, AirDrop, Mail…) sau PDF-ul se descarcă. Salvează-l.
- [ ] Deschide PDF-ul: are toate cele 33 de zone și pozele se văd; la zona cu feedback deschis cercul e pe poză (la zona aprobată apare poza nouă, fără cercuri), iar diacriticele (ă, â, î, ș, ț, ř, č) apar corect.

## 4. Android

Repetă pe Android punctele de bază: o dată cu Android ca Store și laptopul ca Head of VM, apoi invers.

- [ ] O poză verticală din galerie se urcă dreaptă.
- [ ] Notificarea pentru raportul nou ajunge pe dispozitivul Head of VM în cel mult un minut și deschide raportul.
- [ ] Notificarea de feedback ajunge pe Android, când e Store, și deschide direct zona.
- [ ] Desenatul cu degetul: pagina nu derulează, iar atingerea scurtă lasă un punct.
- [ ] **Export PDF**: PDF-ul se deschide, cu poze și diacritice corecte; la o zonă cu feedback deschis, cercul e pe poză.

## 5. Limbile

- [ ] **Settings** → **Čeština**: toată aplicația trece pe cehă, dar numele zonelor rămân în engleză. Încearcă la fel **Slovenčina** și **Română**.
- [ ] Pune contul Store pe română și Head of VM pe engleză, apoi dă un feedback. Notificarea magazinului vine în română („Feedback: … — termen …”), iar a lui Head of VM rămâne în engleză.
- [ ] Ieși din cont și intră din nou: limba aleasă a rămas.
- [ ] Citește ecranele în română: sună firesc? Notează ce ai formula altfel.

## 6. Reminderele (se termină a doua zi)

- [ ] Telefonul tău e logat ca Store, cu notificările pornite.
- [ ] Laptop (Head of VM): pe un raport trimis, dă feedback la o zonă cu deadline **azi** și la altă zonă cu deadline **poimâine**. Nu trimite corecturile.
- [ ] A doua zi, între 09:00 și 10:00 ora Pragăi (10:00–11:00 ora României), vin pe telefon două notificări: una de deadline depășit pentru prima zonă („Overdue: …” sau „Termen depășit: …”) și una de deadline mâine pentru a doua („Reminder: …” sau „Nu uita: …”).
- [ ] Pe ecranul principal al magazinului, prima zonă apare cu roșu, ca **Overdue**.

## 7. Log out

- [ ] Pe iPhone: **Settings** → **Log out**.
- [ ] De pe laptop, fă ceva care trimite o notificare contului din care ai ieșit (de ex. feedback pentru Store). Pe iPhone nu mai vine nimic.
- [ ] Intră din nou în cont pe iPhone: notificările vin din nou.
