import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalPage, contactEmail, type LegalSection } from "@/components/legal/LegalPage";

// Plain-language privacy notice for the hosted service. Self-hosters running
// their own instance are the operator of their data and should replace it.

function sections(locale: string, email: string | null): { intro: string; sections: LegalSection[] } {
  const contact = email ?? (locale === "fr" ? "(adresse à configurer)" : "(address not configured)");
  if (locale === "fr") {
    return {
      intro:
        "Parloir est exploité par Helpy Media inc., à Montréal (Québec). Cette page explique quels renseignements personnels nous recueillons, pourquoi, et comment vous gardez le contrôle.",
      sections: [
        {
          heading: "Ce que nous recueillons",
          body: (
            <ul className="ml-4 list-disc space-y-1">
              <li>Votre adresse courriel, votre nom et un mot de passe haché, pour gérer votre compte.</li>
              <li>Votre clé OpenRouter, chiffrée (AES-256-GCM) et utilisée uniquement pour lancer vos débats.</li>
              <li>Le contenu de vos séances : questions, contexte fourni, transcriptions et synthèses.</li>
              <li>Des données techniques minimales (adresse IP, navigateur) pour la sécurité et la limitation des abus.</li>
              <li>
                Des statistiques de visite agrégées (pages vues, site de provenance, pays, type d&apos;appareil)
                mesurées par Vercel Web Analytics, sans témoins (cookies) et sans vous identifier.
              </li>
            </ul>
          ),
        },
        {
          heading: "Avec qui ces renseignements circulent",
          body: (
            <>
              <p>
                Vos questions et transcriptions sont envoyées aux modèles d&apos;IA que vous choisissez, par
                l&apos;intermédiaire de votre propre compte OpenRouter. Les conditions d&apos;OpenRouter et des
                fournisseurs de modèles s&apos;appliquent à ces échanges.
              </p>
              <p>
                Nous utilisons des sous-traitants pour faire fonctionner le service : Vercel (hébergement),
                notre fournisseur de base de données PostgreSQL, Inngest (exécution des débats) et, si la
                vérification par courriel est activée, Resend (envoi de courriels). Certains sont situés hors
                du Québec, notamment aux États-Unis.
              </p>
              <p>Nous ne vendons pas vos renseignements et n&apos;utilisons pas vos séances pour entraîner des modèles.</p>
            </>
          ),
        },
        {
          heading: "Conservation et suppression",
          body: (
            <p>
              Vos données sont conservées tant que votre compte existe. Vous pouvez supprimer votre compte en
              tout temps dans les paramètres : votre clé, vos séances et vos transcriptions sont alors
              effacées de notre base de données. Les journaux techniques de nos sous-traitants expirent selon
              leurs propres délais.
            </p>
          ),
        },
        {
          heading: "Vos droits et nous joindre",
          body: (
            <p>
              Vous pouvez demander l&apos;accès à vos renseignements, leur rectification ou leur suppression.
              Responsable de la protection des renseignements personnels : Helpy Media inc., {contact}.
            </p>
          ),
        },
      ],
    };
  }
  return {
    intro:
      "Parloir is operated by Helpy Media Inc. in Montréal, Québec. This page explains what personal information we collect, why, and how you stay in control of it.",
    sections: [
      {
        heading: "What we collect",
        body: (
          <ul className="ml-4 list-disc space-y-1">
            <li>Your email address, name and a hashed password, to run your account.</li>
            <li>Your OpenRouter key, encrypted (AES-256-GCM) and used only to run your debates.</li>
            <li>The content of your sessions: questions, any context you add, transcripts and summaries.</li>
            <li>Minimal technical data (IP address, browser) for security and abuse prevention.</li>
            <li>
              Aggregate visit statistics (pages viewed, referring site, country, device type) measured by Vercel
              Web Analytics, without cookies and without identifying you.
            </li>
          </ul>
        ),
      },
      {
        heading: "Who it is shared with",
        body: (
          <>
            <p>
              Your questions and transcripts are sent to the AI models you pick, through your own OpenRouter
              account. OpenRouter&apos;s and the model providers&apos; terms apply to those requests.
            </p>
            <p>
              We use service providers to run Parloir: Vercel (hosting), our PostgreSQL database provider,
              Inngest (running debates) and, when email verification is on, Resend (sending email). Some are
              located outside Québec, including in the United States.
            </p>
            <p>We don&apos;t sell your information and we don&apos;t use your sessions to train models.</p>
          </>
        ),
      },
      {
        heading: "Retention and deletion",
        body: (
          <p>
            We keep your data while your account exists. You can delete your account at any time in Settings:
            your key, sessions and transcripts are then erased from our database. Technical logs held by our
            service providers expire on their own schedules.
          </p>
        ),
      },
      {
        heading: "Your rights and how to reach us",
        body: (
          <p>
            You can ask to access, correct or delete your information. Person in charge of the protection of
            personal information: Helpy Media Inc., {contact}.
          </p>
        ),
      },
    ],
  };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Legal");
  const content = sections(locale, contactEmail());
  return <LegalPage title={t("privacyTitle")} updated={t("updated")} {...content} />;
}
