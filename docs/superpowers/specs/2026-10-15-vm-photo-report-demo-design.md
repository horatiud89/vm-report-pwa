# VM Photo Report — specificație pentru demo

**Data:** 15.10.2026
**Autor brief:** Horațiu Dumitrescu, Area VM Manager, Medicine
**Stadiu:** de aprobat. Codul începe doar după aprobare.

---

## 1. Ce construim

Un demo funcțional al aplicației **VM Photo Report**, pe care îl prezinți lui Head of VM și lui Director of Operations. Demo-ul folosește un singur magazin: **Palladium Praha (850)**, din Cehia.

Demo-ul e o aplicație reală, nu o machetă. Are login cu email și parolă, pozele se salvează online și notificările push ajung pe telefon. Aceeași bază devine aplicația finală. Pentru lansare mai trebuie adăugate celelalte magazine, conturile reale și brandul Medicine.

**Când e gata demo-ul:** tu, ca magazinul 850, trimiți un raport de pe un dispozitiv. Pe al doilea dispozitiv, logat ca Head of VM, primești notificarea, vezi pozele și dai feedback cu cerc pe poză și deadline. Magazinul primește feedback-ul și trimite corectura, iar tu o aprobi. Tot ciclul funcționează, fără nimic simulat.

---

## 2. Cine folosește aplicația

| Rol în aplicație | Ce magazine vede | Ce poate face |
|---|---|---|
| **Store** | doar magazinul lui | face rapoarte, urcă poze, scrie comentarii, trimite corecturi |
| **Area VM** | magazinele din țara lui | dă feedback și deadline, apasă Approve, vede Overview, face Export PDF |
| **Area Manager** | magazinele din țara lui | la fel ca Area VM |
| **Head of VM** | toate magazinele din CZ, SK, RO | la fel ca Area VM |
| **Director of Operations** | toate magazinele din CZ, SK, RO | la fel ca Area VM |

- Țările sunt Cehia (CZ), Slovacia (SK) și România (RO).
- Toți folosesc aplicația doar de pe telefon, pe iPhone (iOS) și Android.
- Mai jos, „cei patru" înseamnă: Area VM și Area Manager din țara magazinului, plus Head of VM și Director of Operations.

---

## 3. Magazinul și zonele

**Magazin:** cod **850**, nume **Palladium Praha**, țara **Cehia**.

Zonele sunt preluate din lista ta, în aceeași ordine, plus departamentul **WINDOW** cerut separat. Sunt 33 de zone în 5 departamente. Numele zonelor **rămân în engleză** în toate limbile aplicației.

| WOMEN'S DEPARTMENT | MEN'S DEPARTMENT | ACC | HOME | WINDOW |
|---|---|---|---|---|
| Women's Image | Men's Wall 1 | Men's Ladders zone A | Home wall | Window 1 |
| Women's Wall 1 | Men's Denim panel | Women's Ladders zone A | Small table | Window 2 |
| Women's Art. Series zone | Men's Denim table (chest of drawers) | Men's Ladders zone B | Large table | |
| Women's Denim panel | Men's Wall 2 | Women's Ladders zone B | | |
| Women's Denim table (chest of drawers) | Men's Table 1 | Cash desk ladders | | |
| Women's Wall 2 | Men's Image | ACC wall | | |
| Women's Table 1 | Men's Table 2 | | | |
| Women's Table 2 | Men's Wall 3 | | | |
| Women's Wall 3 | Men's Free-standing zone A | | | |
| Women's Free-standing zone A | Men's Free-standing zone B | | | |
| Women's Free-standing zone B | Men's Art. Series zone | | | |

Lista originală e salvată lângă acest document, în `2026-10-15-zone-list-palladium-praha-850.png`.

---

## 4. Raportul: ce face magazinul

### Pașii

1. **Login.** Magazinul intră cu emailul și parola lui. Prima dată apasă „Set / forgot password", primește un link pe email și își alege parola.
2. **Ecranul principal.**
   - Sus apar corecturile de făcut, fiecare cu deadline-ul ei.
   - Dedesubt e lista rapoartelor, cu numele campaniei, data și statusul.
   - Jos e butonul **New report**.
3. **New report.** Magazinul scrie numele campaniei, care e obligatoriu. Apoi vede zonele grupate pe departamente.
4. **Pe o zonă.**
   - Apasă **Take photo** sau **Choose from gallery**.
   - Pentru o zonă inclusă în campanie, o poză e obligatorie. Mai poate adăuga încă două, deci maximum 3 poze pe zonă.
   - Poate scrie un comentariu la zonă, dacă vrea.
   - Pozele se pot șterge sau înlocui până la trimitere.
5. **Zonele fără poză.** Se marchează **Not part of this campaign**.
6. **Send.** Butonul se activează când fiecare zonă are fie cel puțin o poză, fie marcajul. Raportul trebuie să aibă și cel puțin o zonă cu poză.

### Reguli

- **Salvare automată.** Tot ce a urcat magazinul se salvează pe loc, ca ciornă. Dacă se închide aplicația sau pică netul, magazinul continuă de unde a rămas.
- **O singură ciornă.** Un magazin are o singură ciornă deschisă la un moment dat.
- **Poze micșorate automat.** Înainte de upload, poza se micșorează la maximum 1920 px pe latura lungă. *De ce:* se încarcă repede și pe date mobile, iar detaliile rămân vizibile.
- **Raport blocat după Send.** După trimitere, raportul nu se mai poate modifica. Se pot trimite doar corecturile cerute.

---

## 5. Feedback, corecturi și Approve

### Ce văd cei care verifică

Cei care verifică sunt Area VM, Area Manager, Head of VM și Director of Operations.

1. **Ecranul principal.**
   - Apare lista rapoartelor trimise, cele mai noi primele.
   - Pentru fiecare raport se văd codul și numele magazinului, țara, campania și data trimiterii.
   - Rapoartele încă nedeschise de tine au eticheta **New**.
   - Head of VM și Director of Operations pot filtra lista pe țară.
2. **Raportul.**
   - Zonele apar pe departamente, fiecare cu statusul ei.
   - Se văd pozele și comentariul magazinului.
3. **Feedback sub fiecare poză.**
   - **Comentariul** e obligatoriu.
   - Cu **Mark on photo** desenezi cu degetul, cu roșu, peste poză. **Undo** șterge ultimul cerc. Poza originală nu se modifică, cercurile stau separat, peste ea.
   - **Deadline-ul** se alege din calendar și conține doar data, fără oră.
   - **Send feedback** trece zona în statusul **Needs correction**.
4. **Feedback-ul tuturor e vizibil.** Fiecare vede feedback-ul dat de ceilalți, cu numele, rolul și data.
5. **Approve.**
   - Butonul **Approve** e pe fiecare zonă trimisă sau corectată.
   - Pe raport mai e butonul **Approve all without feedback**. El aprobă dintr-o dată toate zonele în statusul **Submitted**, adică cele care n-au primit niciodată feedback.
   - Zonele corectate se aprobă doar una câte una, după comparația înainte / după.
   - *(De confirmat de Horațiu: vezi „Puncte de confirmat" la final.)*

### Ce face magazinul după feedback

1. Primește notificarea push.
2. Pe ecranul principal vede corectura sus, cu deadline-ul. Dacă deadline-ul a trecut, corectura apare cu roșu, ca **Overdue**.
3. Deschide zona și vede poza cu cercurile, comentariul și deadline-ul.
4. Face pozele noi, între 1 și 3, poate scrie un comentariu și apasă **Send correction**. Zona trece în statusul **Correction sent**.
5. Pozele vechi nu se șterg, rămân în istoricul zonei.

### Înainte / după

La o zonă corectată, cel care verifică vede poza veche, cu cercurile, lângă poza nouă. De acolo poate apăsa **Approve** sau poate da un feedback nou. Dacă dă feedback nou, ciclul se reia.

### Reguli

- Feedback se poate da pe orice zonă cu poze din raportul trimis, inclusiv pe o zonă deja aprobată. Zona redevine **Needs correction**.
- Dacă o zonă are mai multe feedback-uri deschise, o singură corectură le acoperă pe toate. Reminderele folosesc cel mai apropiat deadline.
- Magazinul nu poate da feedback și nu poate apăsa Approve. Cei care verifică nu pot modifica pozele magazinului.

---

## 6. Statusurile unei zone

| Status | Când | Culoare |
|---|---|---|
| Empty | ciornă, zona nu are încă poză | gri deschis |
| Photo added | ciornă, zona are cel puțin o poză | negru |
| Not part of this campaign | marcată de magazin | gri |
| Submitted | raport trimis, fără feedback | negru |
| Needs correction | are feedback deschis | roșu |
| Overdue | Needs correction, iar deadline-ul a trecut | roșu închis |
| Correction sent | magazinul a trimis corectura | portocaliu |
| Approved | aprobată | verde |

Statusul raportului se calculează din statusurile zonelor:

- **Draft**: ciornă.
- **Sent**: trimis, fără feedback.
- **Corrections open (n)**: are n zone cu corectură deschisă.
- **Approved**: toate zonele cu poze sunt aprobate.

---

## 7. Notificări push

| Când | Cine primește |
|---|---|
| Magazinul trimite raportul | cei patru |
| Cineva dă feedback | magazinul |
| Magazinul trimite corectura | cei patru |
| Cineva aprobă o zonă | magazinul |
| Cineva apasă „Approve all without feedback" | magazinul, o singură notificare pentru tot raportul |
| Cu o zi înainte de deadline, la 09:00 | magazinul, dacă zona n-a fost corectată |
| Ziua de după deadline, la 09:00 | magazinul, dacă zona tot n-a fost corectată |

- **Ora reminderelor** e ora locală a magazinului: Praga pentru CZ și SK, București pentru RO.
- **Limba notificării** e limba aleasă de cel care o primește.
- **Ce se deschide la apăsare.** Apăsarea pe notificare deschide direct raportul sau zona respectivă.
- **Exemple de text:**
  - *„850 Palladium Praha sent a report: [numele campaniei scris de magazin]"*
  - *„Feedback: Women's Wall 1 — deadline 16.10"*

---

## 8. Overview (panoul general)

E disponibil pentru cei care verifică. Pentru fiecare magazin la care au acces se vede ultimul raport trimis:

- campania și data;
- zonele pe departamente, colorate după status;
- câte zone sunt Needs correction, Overdue sau Approved.

Apăsarea pe un magazin deschide raportul. În demo apare doar magazinul 850.

---

## 9. Export PDF

E disponibil pentru cei care verifică, din ecranul raportului, cu butonul **Export PDF**. PDF-ul conține:

- **Antetul:** codul și numele magazinului, țara, campania, data trimiterii și data exportului.
- **Fiecare zonă, pe departamente:**
  - statusul;
  - pozele actuale, cu cercurile;
  - comentariul magazinului;
  - tot feedback-ul: autor, rol, dată, comentariu, deadline și status.

PDF-ul se generează pe telefon. Pe iPhone se deschide meniul de salvare sau trimitere.

---

## 10. Limbi

- Aplicația pornește implicit în **engleză**.
- Oricine poate schimba limba din **Settings** în cehă, slovacă sau română. Alegerea rămâne salvată pe cont.
- Numele zonelor rămân în engleză în toate limbile.
- Româna urmează glosarul de VM al lui Horațiu.
- Cehă și slovacă le scriu eu. Înainte de lansarea la toate magazinele trebuie verificate de cineva nativ. Pentru demo nu e nevoie.

---

## 11. Aspect

Demo-ul are un aspect neutru: fundal alb, text negru, nuanțe de gri. Culorile apar doar la statusuri. Butoanele sunt mari, ușor de apăsat cu degetul.

Demo-ul nu folosește logo-ul, fonturile sau culorile Medicine. Brandul se aplică înainte de lansare, după brand book.

---

## 12. Instalarea pe telefon și notificările

- Aplicația se deschide dintr-un link de forma `https://<numele-proiectului>.web.app`.
- **iPhone:**
  - E nevoie de iOS 16.4 sau mai nou.
  - Linkul se deschide în Safari, apoi aplicația se adaugă pe ecran cu **Share → Add to Home Screen**.
  - La prima deschidere, aplicația arată cei 3 pași.
  - Notificările merg doar din aplicația pusă pe ecranul principal.
- **Android:** linkul se deschide în Chrome, care propune instalarea. Notificările merg.
- **Activarea notificărilor.** După login apare butonul **Turn on notifications**. Telefonul cere ca utilizatorul să apese el o dată pentru a permite notificările.
- **Logout.** După logout, telefonul nu mai primește notificările acelui cont.

---

## 13. Conturile de demo

Toate conturile folosesc adresa ta de Gmail, cu un sufix după „+":

- Gmail livrează toate emailurile în inboxul tău.
- Firebase le vede ca 5 conturi diferite.
- Numele afișat în aplicație e rolul, fără nume de persoane.

| Cont | Adresa |
|---|---|
| Store — 850 Palladium Praha | adresa ta, cu `+store850` înainte de `@gmail.com` |
| Head of VM | cu `+headofvm` |
| Director of Operations | cu `+director` |
| Area VM — Cehia | cu `+avmcz` |
| Area Manager — Cehia | cu `+amcz` |

- **Adresa nu apare nicăieri în cod.** Repo-ul e public, așa că adresa se dă scriptului care creează conturile printr-o setare secretă din GitHub.
- **Testarea cere două dispozitive deodată.** De exemplu, telefonul ca magazin și laptopul, în Chrome, ca Head of VM. Sau două telefoane. Notificarea ajunge pe dispozitivul pe care e logat contul respectiv.

---

## 14. Ce NU intră în demo

- Alte magazine în afară de 850 și conturile reale ale oamenilor.
- Ecrane de administrare pentru adăugarea de magazine, utilizatori sau zone. În demo le adaug eu, printr-un script.
- Brandul Medicine.
- Publicarea în App Store sau Google Play.
- Notificări pe email. Există doar notificări push.
- Lucrul complet offline. Ciorna se salvează, dar upload-ul are nevoie de internet.
- Ștergerea rapoartelor trimise.
- Verificarea traducerilor în cehă și slovacă de către vorbitori nativi.

---

## 15. Partea tehnică

*Secțiunea asta e pentru mine și pentru planul de implementare. Nu trebuie s-o citești în detaliu.*

### Componente

- **Aplicația (frontend):**
  - PWA scrisă în React + TypeScript + Vite.
  - Un singur service worker, folosit și pentru instalare, și pentru notificări (Firebase Cloud Messaging).
  - Textele interfeței stau în dicționare tipizate, câte unul pentru EN, CS, SK și RO.
- **Firebase Authentication:**
  - Login cu email și parolă.
  - Fiecare cont are în token trei câmpuri: `role` (`store` | `avm` | `am` | `head_vm` | `director`), `country` (`CZ` | `SK` | `RO` | null) și `storeId` (sau null).
- **Cloud Firestore**, în regiunea `europe-west3` (Frankfurt), pentru date.
- **Cloud Storage**, în aceeași regiune, pentru poze. Calea unei poze e `reports/{country}/{storeId}/{reportId}/{zoneId}/v{version}_{index}.jpg`.
- **Cloud Functions (2nd gen)**, în `europe-west3`:
  - Funcții apelabile pentru schimbările de status: `sendReport`, `giveFeedback`, `sendCorrection`, `approveZone`, `approveAllWithoutFeedback`.
  - Fiecare funcție verifică rolul, accesul la țară sau magazin și dacă trecerea de status e permisă, apoi trimite notificările.
  - O funcție programată zilnic se ocupă de remindere.
- **Firebase Cloud Messaging** pentru Web Push, cu cheie VAPID. Token-urile de notificare se țin pe utilizator și se șterg la logout sau când devin invalide.
- **Firebase Hosting** pentru aplicație. Oferă HTTPS, cerut de PWA și de notificări.

### Modelul de date (Firestore)

- `stores/{storeId}`:
  - `code`, `name`, `country`, `timezone`;
  - `departments: [{ id, name, zones: [{ id, name }] }]`.
- `users/{uid}`: `email`, `role`, `country`, `storeId`, `displayName`, `language`, `fcmTokens[]`.
- `reports/{reportId}`:
  - date despre magazin: `storeId`, `storeCode`, `storeName`, `country`;
  - `campaignName`, `status` (`draft` | `sent`), `createdAt`, `sentAt`, `seenBy[]`;
  - `counts`: câte zone sunt în fiecare status.
- `reports/{reportId}/zones/{zoneId}`:
  - `departmentId`, `name`, `order`, `state`;
  - `versions: [{ n, photos: [{ path, width, height }], storeComment, createdAt }]`;
  - `earliestOpenDeadline`, `approvedBy`, `approvedAt`.
- `reports/{reportId}/zones/{zoneId}/feedback/{feedbackId}`:
  - autorul: `authorUid`, `authorRole`, `authorName`;
  - poza vizată: `version`, `photoIndex`;
  - `comment`;
  - `strokes`: liste de puncte normalizate 0–1, deci cercurile se potrivesc pe orice mărime de ecran;
  - `deadline` (`YYYY-MM-DD`), `createdAt`, `status` (`open` | `answered`);
  - `reminderDayBeforeSent`, `reminderOverdueSent`.

### Securitate

- **Regulile Firestore și Storage:**
  - Fiecare citește doar ce îi permite rolul: magazinul doar magazinul lui, Area VM și Area Manager doar țara lor, Head of VM și Director of Operations tot.
  - Clientul scrie direct doar în ciorna propriului magazin: poze, comentariu și marcajul „Not part of this campaign".
  - Orice altă schimbare trece prin Cloud Functions.
- **Rapoartele trimise** nu pot fi modificate direct din aplicație.

### Publicare (deploy) și conturi

- **Deploy prin GitHub Actions.** La fiecare push pe branch, aplicația, regulile și funcțiile se publică în proiectul Firebase. Se folosește un service account salvat ca secret în GitHub. Horațiu nu are nevoie de terminal.
- **Script de inițializare.** Rulează manual, din GitHub Actions, și creează:
  - magazinul 850 cu cele 33 de zone;
  - cele 5 conturi, cu rolurile lor.

  Adresa de email de bază vine dintr-un secret GitHub.

### Costuri

- Planul Firebase **Blaze** (plată la consum) e obligatoriu pentru stocarea pozelor și pentru Cloud Functions.
- La volumul demo-ului, costul e de câțiva cenți pe lună sau zero.
- Se setează o alertă de buget de 5 USD în Google Cloud.

### Testare

- **Teste automate (Vitest)** pentru logica aplicației:
  - trecerile de status;
  - regula pentru butonul Send;
  - cine primește fiecare notificare;
  - calculul datelor pentru remindere;
  - faptul că fiecare text există în toate cele 4 limbi;
  - faptul că lista de zone are 33 de zone, în ordinea din brief.
- **Teste pe regulile de securitate**, cu Firebase Emulator. De exemplu, Area VM din Cehia nu vede un magazin din Slovacia, iar magazinul nu poate apăsa Approve.
- **Verificare manuală** pe iPhone și Android, după o listă de pași. Lista o primește Horațiu la final.

---

## 16. Ce ai de făcut tu (pe scurt)

Pașii detaliați, cu capturi de ecran, vin în planul de implementare.

1. Creezi un proiect în Firebase Console, din contul tău Google.
2. Treci proiectul pe planul Blaze și setezi alerta de buget.
3. Copiezi câteva chei din Firebase în setările secrete ale repo-ului din GitHub.
4. Pornești scriptul care creează conturile, apoi îți setezi parolele din emailuri.

---

## Puncte de confirmat

1. **Approve.** Documentul descrie acum varianta A.
   - **A)** Approve există pe orice zonă trimisă sau corectată. Pe raport există și butonul „Approve all without feedback", care aprobă dintr-o dată zonele care n-au primit niciodată feedback.
   - **B)** Approve apare doar pe zonele corectate, după feedback. Zonele fără feedback rămân Submitted.
