# Firebase și GitHub: setup pas cu pas

Ghidul te duce de la zero la aplicația publicată, cu cele 5 conturi de demo. Durează cam 45 de minute și nu ai nevoie de terminal.

**Ce îți trebuie:** laptopul, contul tău Google (Gmail), un card pentru planul Blaze și acces de admin la repo-ul `vm-report-pwa` din GitHub.

**Înainte să începi:**

- Deschide un fișier text gol (Notepad sau Notes). Pe parcurs copiezi în el câteva valori, pe care la final le pui în GitHub.
- Numele de meniuri și butoane sunt în engleză, exact cum apar în Firebase, Google Cloud și GitHub. Dacă interfața ta e în altă limbă, treci-o pe engleză.
- Firebase își mai mută meniurile. Dacă nu găsești ceva în meniul din stânga, caută-l după nume în bara de căutare din consolă.
- În exemple, Project ID-ul e `vm-photo-report-4f2a1`. Al tău va fi altul.

## 1. Proiectul Firebase

1. Deschide https://console.firebase.google.com și intră cu contul tău Google.
2. Apasă **Create a project** (pe unele ecrane: **Get started with a Firebase project**).
3. Scrie numele proiectului, de exemplu `vm-photo-report`, și acceptă termenii dacă ți-i cere. Sub nume apare **Project ID**. Copiază-l în fișierul text: e `FIREBASE_PROJECT_ID`. Apasă **Continue**.
4. Dacă apare un ecran despre Gemini (AI assistance), apasă **Continue** fără să schimbi nimic.
5. La **Google Analytics**, oprește comutatorul (demo-ul nu-l folosește) și apasă **Create project**.
   După un minut vezi „Your Firebase project is ready”. Apasă **Continue**.

## 2. Planul Blaze și alerta de buget

Fără Blaze nu merg pozele și funcțiile din spatele aplicației. La volumul demo-ului costul e zero sau câțiva cenți pe lună.

6. Jos în meniul din stânga, lângă planul **Spark**, apasă **Upgrade**.
7. Alege **Blaze**, apoi creează un cont de facturare (**Create a Cloud Billing account**) cu țara și cardul tău și leagă-l de proiect. Dacă îți cere un buget pe parcurs, scrie `5`.
   La final, în stânga jos scrie **Blaze**.
8. Deschide https://console.cloud.google.com/billing/budgets și, dacă îți cere, alege contul de facturare de la pasul 7.
   Dacă la pasul 7 ai pus deja bugetul, îl vezi aici în listă. Verifică doar că suma e 5 și treci la pasul 13.
9. Apasă **Create budget**.
10. La **Name** scrie `VM Photo Report`, la **Projects** alege proiectul tău. Apasă **Next**.
11. La **Budget type** lasă **Specified amount**, la **Target amount** scrie `5`. Apasă **Next**.
    Suma e în moneda contului de facturare. Dacă nu e USD, pune echivalentul: cam 5 EUR sau 23 RON.
12. Lasă pragurile 50%, 90%, 100% și bifa **Email alerts to billing admins and users**. Apasă **Finish**.
    Bugetul apare în listă. Alerta doar îți trimite un email, nu oprește nimic.

## 3. Firestore (baza de date)

13. Înapoi în consola Firebase, din meniul din stânga deschide **Firestore Database** și apasă **Create database**.
14. Dacă te întreabă de ediție, alege **Standard edition** și apasă **Next**.
15. **Database ID** rămâne `(default)`. La **Location** alege **europe-west3 (Frankfurt)**. Apasă **Next**.
16. Alege **Start in production mode** și apasă **Create**.
    Vezi o bază de date goală. Locația nu se mai poate schimba, de asta contează să fie europe-west3.

## 4. Storage (pozele)

17. Din meniul din stânga deschide **Storage** și apasă **Get started**.
18. La **Location** alege **europe-west3** (dacă nu apare direct, e la **All locations**). **Access frequency** rămâne **Standard**. Apasă **Continue**.
19. Alege **Start in production mode** și apasă **Create**.
    Vezi un spațiu gol cu adresa `gs://vm-photo-report-4f2a1.firebasestorage.app`.

## 5. Login cu email și parolă

20. Din meniul din stânga deschide **Authentication** și apasă **Get started**.
21. În tab-ul **Sign-in method** apasă **Email/Password**.
22. Pornește primul comutator, **Enable**. Al doilea, **Email link (passwordless sign-in)**, rămâne oprit. Apasă **Save**.
    În listă, Email/Password apare cu **Enabled**.

## 6. Aplicația web și valorile ei

23. Apasă rotița de lângă **Project Overview** (sus în stânga) și alege **Project settings**.
24. În tab-ul **General**, jos la **Your apps**, apasă iconița Web, **</>**.
25. La **App nickname** scrie `VM Photo Report`. Nu bifa **Also set up Firebase Hosting**, de asta se ocupă GitHub. Apasă **Register app**.
26. Apare un bloc de cod cu `const firebaseConfig = { ... }` și 6 valori. Copiază în fișierul text valorile din tabel, doar textul dintre ghilimele:

    | În cod | Secretul din GitHub | Cum arată |
    |---|---|---|
    | `apiKey` | `FIREBASE_API_KEY` | `AIzaSy…` |
    | `projectId` | `FIREBASE_PROJECT_ID` (îl ai de la pasul 3) | `vm-photo-report-4f2a1` |
    | `storageBucket` | `FIREBASE_STORAGE_BUCKET` | `vm-photo-report-4f2a1.firebasestorage.app` |
    | `messagingSenderId` | `FIREBASE_MESSAGING_SENDER_ID` | doar cifre |
    | `appId` | `FIREBASE_APP_ID` | `1:123456789012:web:…` |

    `authDomain` nu-ți trebuie: GitHub îl face singur din Project ID.
27. Apasă **Continue to console**.
    Valorile le găsești oricând în **Project settings** → **General** → **Your apps** → **SDK setup and configuration** → **Config**.

## 7. Cheia pentru notificări (VAPID)

28. Tot în **Project settings**, deschide tab-ul **Cloud Messaging**.
29. Jos, la **Web configuration** → **Web Push certificates**, apasă **Generate key pair**.
30. Copiază în fișierul text textul lung din coloana **Key pair**. E `FIREBASE_VAPID_KEY`.

## 8. Contul tehnic prin care GitHub publică aplicația

GitHub publică aplicația în locul tău printr-un „service account”: un cont tehnic, cu drepturi doar pe proiectul ăsta.

31. Deschide https://console.cloud.google.com. Sus, din lista de proiecte, alege proiectul tău (are același nume ca în Firebase).
32. Din meniul ☰ mergi la **IAM & Admin** → **Service Accounts** și apasă **+ Create service account**.
33. La **Service account name** scrie `github-deploy` și apasă **Create and continue**.
34. La **Permissions** adaugă pe rând cele 10 roluri de mai jos. Pentru fiecare: dai click în **Select a role**, scrii numele, îl alegi din listă, apoi apeși **+ Add another role** pentru următorul.
    - Firebase Admin
    - Cloud Functions Admin
    - Cloud Run Admin
    - Service Account User
    - Cloud Scheduler Admin
    - Artifact Registry Administrator
    - Cloud Build Editor
    - Service Usage Admin
    - Storage Admin
    - API Keys Admin
35. Apasă **Continue**, apoi **Done**.
    În listă apare `github-deploy@vm-photo-report-4f2a1.iam.gserviceaccount.com`.
36. Apasă pe adresa lui și deschide tab-ul **Keys**.
37. Apasă **Add key** → **Create new key**, alege **JSON** și apasă **Create**.
    Laptopul descarcă un fișier `.json`. E singura valoare cu adevărat secretă din tot ghidul: n-o trimite pe email sau pe chat. Celelalte valori ajung oricum în aplicația publicată.
    Dacă Google îți spune că nu ai voie să creezi chei, proiectul e sub o organizație de firmă: ia-o de la capăt cu un proiect creat din contul personal de Gmail.
38. Deschide fișierul cu Notepad (Windows) sau TextEdit (Mac) și copiază tot, de la prima `{` până la ultima `}`. E `FIREBASE_SERVICE_ACCOUNT`; îl lipești direct în GitHub la pasul 41.

## 9. Secretele din GitHub

39. Deschide repo-ul `vm-report-pwa` pe GitHub și apasă **Settings** (tab-ul repo-ului, nu setările contului tău).
40. În stânga: **Secrets and variables** → **Actions**.
41. Apasă **New repository secret**. La **Name** scrie numele exact din tabel, la **Secret** lipește valoarea, apoi apasă **Add secret**. Repetă pentru toate 8:

    | Name | Valoarea | De unde |
    |---|---|---|
    | `FIREBASE_SERVICE_ACCOUNT` | tot conținutul fișierului JSON | pasul 38 |
    | `FIREBASE_PROJECT_ID` | Project ID | pasul 3 |
    | `FIREBASE_API_KEY` | `apiKey` | pasul 26 |
    | `FIREBASE_STORAGE_BUCKET` | `storageBucket` | pasul 26 |
    | `FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` | pasul 26 |
    | `FIREBASE_APP_ID` | `appId` | pasul 26 |
    | `FIREBASE_VAPID_KEY` | Key pair | pasul 30 |
    | `DEMO_EMAIL` | adresa ta de Gmail, fără niciun `+` | — |

    La **Repository secrets** vezi acum 8 nume. GitHub nu mai arată valorile după salvare. Dacă ai greșit una, apasă creionul de lângă ea și pune valoarea din nou.

## 10. Publicarea aplicației

42. În repo deschide tab-ul **Actions** și alege în stânga **Deploy**.
43. În dreapta apasă **Run workflow**, lasă branch-ul care e deja ales și apasă butonul verde **Run workflow**.
44. Așteaptă 5–10 minute, până când rularea primește o bifă verde.
    Dacă rularea se termină verde în câteva secunde, secretul `FIREBASE_SERVICE_ACCOUNT` lipsește sau are alt nume (pasul 41).

Dacă apare un X roșu, apasă pe rulare, apoi pe pasul roșu, și citește ultimele rânduri:

- **Lipsește un rol sau o permisiune** („Permission denied”, „does not have … permission”, „roles/…”): eroarea spune ce rol lipsește și pentru ce cont. În Google Cloud mergi la **IAM & Admin** → **IAM**, apasă creionul de lângă contul respectiv, apoi **+ Add another role**, alege rolul și apasă **Save**. Dacă adresa din eroare nu e în listă, apasă **+ Grant access**, lipește adresa la **New principals**, alege rolul și apasă **Save**. Pe GitHub apasă **Re-run jobs** → **Re-run all jobs**.
- **Eroarea spune să încerci din nou peste câteva minute** (se întâmplă la prima publicare, până pornește Google serviciile): așteaptă 5 minute și apasă **Re-run all jobs**.

De acum încolo, aplicația se republică singură la fiecare modificare de cod.

## 11. Magazinul și conturile de demo

45. Tot în **Actions**, alege în stânga **Seed demo**, apasă **Run workflow** și apoi butonul verde **Run workflow**.
46. Așteaptă bifa verde (1–2 minute).
    Acum există magazinul 850 Palladium Praha, cu cele 33 de zone, și cele 5 conturi.

Conturile folosesc adresa ta de Gmail cu un sufix după „+”. Gmail ignoră tot ce e între „+” și „@”, așa că toate emailurile ajung în inboxul tău, dar Firebase le vede ca 5 conturi diferite. Dacă adresa ta ar fi `numele.tau@gmail.com`, conturile sunt:

| Cont | Adresa |
|---|---|
| Store — 850 Palladium Praha | `numele.tau+store850@gmail.com` |
| Head of VM | `numele.tau+headofvm@gmail.com` |
| Director of Operations | `numele.tau+director@gmail.com` |
| Area VM — Cehia | `numele.tau+avmcz@gmail.com` |
| Area Manager — Cehia | `numele.tau+amcz@gmail.com` |

## 12. Parolele

Linkul aplicației e `https://` + Project ID + `.web.app`, de exemplu `https://vm-photo-report-4f2a1.web.app`. Pe el îl deschizi și pe telefon.

47. Deschide linkul. Vezi ecranul **Sign in**.
48. Apasă **Set / forgot password**, scrie adresa cu `+store850` și apasă **Send link**.
49. În Gmail vine un email „Reset your password for …” (dacă nu e în Inbox, uită-te în Spam). Deschide linkul din email, scrie parola și apasă **Save**.
50. Repetă pașii 48–49 pentru celelalte 4 adrese. În fiecare email apare adresa contului, așa că nu le încurci.
51. Verifică un cont: pe ecranul **Sign in** scrie adresa cu `+store850` și parola ei, apoi apasă **Sign in**. Vezi „850 Palladium Praha” și butonul **New report**.

## 13. Curățenie

52. Șterge de pe laptop fișierul `.json` de la pasul 37 și golește Coșul (Recycle Bin / Trash). GitHub îl are deja salvat ca secret. Șterge și fișierul text cu valorile.
    Dacă vreodată ai nevoie de o cheie nouă, o faci din nou cu pașii 36–38 și o pui în locul secretului `FIREBASE_SERVICE_ACCOUNT`.

Gata. Testul pe telefon e în `test-checklist.ro.md`.
