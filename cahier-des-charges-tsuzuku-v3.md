Cahier des charges – Tsuzuku V3
Complément aux cahiers des charges V1 et V2

1. Introduction et contexte
La V2 est en production : authentification, watchlist synchronisée, recherche AniList, calendrier de diffusion, import en masse, recommandations, vue saison, roulette de découverte, système d'amis (demandes, acceptation/refus, « vu avec »), et un profil enrichi (visibilité publique/amis/privée, favoris, statistiques, liens externes, changement de mot de passe, suppression de compte). Un module de connexion pair-à-pair (`src/lib/multiplayer/p2p.ts`) existe déjà dans le code mais n'est branché à aucune fonctionnalité visible — c'est le point de départ naturel de cette V3.

2. Objectifs de la V3
Exploiter le socle social (amis) et technique (P2P déjà en place) pour des usages collectifs en temps réel, tout en corrigeant les frictions relevées à l'usage sur le profil et la modération du contenu partagé entre utilisateurs.

3. Périmètre fonctionnel V3

3.1 Watch Party synchronisée (priorité 1)
- Description : une salle éphémère où plusieurs amis suivent en même temps la progression d'un épisode (compte à rebours commun, marquage « vu » synchronisé), en s'appuyant sur le module P2P déjà présent dans le code.
- Flux : depuis la fiche d'un anime partagé avec des amis (« vu avec »), un bouton « Démarrer une session » génère un lien de salle ; les amis invités rejoignent via ce lien, sans compte tiers.
- Portée volontairement limitée : pas de lecture vidéo intégrée (droits d'auteur), uniquement la coordination — chat texte minimal, statut « prêt / en pause / terminé » par participant, et mise à jour automatique de la progression de chacun dans sa propre watchlist en fin de session.
- Critère d'acceptation : deux comptes amis peuvent ouvrir la même salle depuis deux navigateurs différents et voir l'état de l'autre se mettre à jour sans rechargement de page.

3.2 Notifications d'activité des amis (priorité 1)
- Description : un flux (ou au minimum un badge) signalant qu'un ami a terminé un titre, ajouté une note, ou envoyé/accepté une demande d'ami — sans construire un mur social complet.
- Portée : lecture seule, pas de réactions ni de commentaires ; respecte la visibilité choisie par chacun (un événement sur un profil « privé » ou « amis » ne remonte qu'aux amis concernés).
- Affichage : badge sur l'icône profil (déjà présent dans la nav) pour les demandes d'ami en attente + un petit encart « activité récente » sur le tableau de bord.
- Critère d'acceptation : marquer un titre comme terminé fait apparaître l'événement chez les amis concernés en moins d'une minute, sans qu'ils aient à rafraîchir manuellement plus d'une fois.

3.3 Modération et confidentialité des interactions sociales (priorité 1)
- Description : avec des demandes d'ami ouvertes à tout pseudo trouvé, il faut un moyen de se protéger d'un usage abusif.
- Fonctionnalités : bloquer un utilisateur (empêche toute nouvelle demande et masque son profil des résultats de recherche pour lui comme pour vous), et limiter le nombre de demandes d'ami sortantes par heure pour décourager le spam.
- Critère d'acceptation : un utilisateur bloqué ne peut plus retrouver le profil de la personne qui l'a bloqué, ni lui envoyer de demande.

3.4 Listes partagées collaboratives (priorité 2)
- Description : au-delà du « vu avec » par titre, une liste nommée (« Anime du ciné-club ») visible et éditable par un groupe d'amis choisis, distincte de la watchlist personnelle de chacun.
- Portée : reste simple — une liste = un ensemble de titres + qui l'a ajouté, sans statut de progression individuel dans cette V3 (chacun garde son propre suivi dans sa watchlist personnelle).
- Critère d'acceptation : un membre ajoute un titre à la liste partagée et les autres membres le voient apparaître sans recharger manuellement.

3.5 Historique et export enrichi (priorité 2)
- Description : l'export CSV/JSON déjà disponible en V1.1 (si construit) est complété par un historique des changements de statut par titre (dates de début/fin de visionnage), utile pour des statistiques personnelles plus fines et un export vers d'autres outils.
- Critère d'acceptation : exporter sa liste inclut, pour chaque titre terminé, une date de début et une date de fin estimées à partir des changements de statut successifs.

3.6 Nettoyage et dette technique (priorité 1, transverse)
- Retirer le module `multiplayer/p2p.ts` du dépôt s'il n'est pas repris en 3.1, ou le brancher — du code mort de 570 lignes ne doit pas rester indéfiniment sans être relié à une fonctionnalité.
- Réunifier les projections de profil : plusieurs fichiers (`profile.ts`, `friends.ts`) ont déjà dû être resynchronisés après l'ajout des favoris/visibilité ; toute nouvelle fonctionnalité touchant le profil doit passer par la même fonction de mapping partagée pour éviter que la dérive ne se reproduise.
- Supprimer les fichiers de sauvegarde (`*.bak`) du dépôt versionné.

4. Priorisation proposée
Phase 1 : 3.3 Modération/blocage (protège les utilisateurs dès que le graphe social grossit), 3.6 Nettoyage technique.
Phase 2 : 3.2 Notifications d'activité.
Phase 3 : 3.1 Watch Party, 3.4 Listes partagées.
Phase 4 : 3.5 Historique enrichi.

5. Exigences non fonctionnelles spécifiques à la V3
- Toute donnée liée au blocage/notifications suit la convention déjà établie : migration SQL dédiée, table scopée par `user_id`, vérification de session serveur (`authMiddleware` / `optionalAuthMiddleware` selon le cas).
- Le P2P (3.1) ne doit jamais devenir un point de collecte de données personnelles supplémentaire : les échanges de signalisation transitent par le serveur existant, mais le contenu de la session (chat, statut) reste éphémère, non persisté après la fermeture de la salle.
- Les fonctionnalités sociales nouvelles ne doivent jamais contourner les niveaux de visibilité de profil déjà en place (public / amis / privé).

6. Hors périmètre V3 (reporté)
- Lecture vidéo intégrée ou intégration d'un service de streaming tiers.
- Fil d'actualité public façon réseau social (commentaires, likes, republication).
- Groupes/serveurs façon Discord — les listes partagées (3.4) restent volontairement minimales.

7. Critères de succès de la V3
- Un groupe de 3 amis peut suivre un épisode ensemble en session synchronisée sans quitter Tsuzuku.
- Un utilisateur harcelé par des demandes d'ami peut s'en protéger en un clic, durablement.
- Aucun code mort (P2P non branché, fichiers `.bak`) ne subsiste dans le dépôt à la fin de la V3.
