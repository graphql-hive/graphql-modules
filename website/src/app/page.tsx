import {
  Hero,
  CallToAction,
  cn,
  GitHubIcon,
  Heading,
  InfoCard,
  ModulesLogo,
  ToolsAndLibrariesCards,
} from '@theguild/components';
import { metadata as rootMetadata } from './layout';

export const metadata = {
  alternates: {
    // to remove leading slash
    canonical: '.',
  },
  openGraph: {
    ...rootMetadata!.openGraph,
    // to remove leading slash
    url: '.',
  },
};

export default function IndexPage() {
  return (
    <div className="flex h-full flex-col mx-auto max-w-[90rem] overflow-hidden">
      <Hero
        heading="Enterprise Grade Tooling for Your GraphQL Server"
        text="GraphQL Modules is a toolset of libraries and guidelines dedicated to create reusable, maintainable, testable and extendable modules out of your GraphQL server."
        top={<ModulesLogo />}
        checkmarks={['Fully open source', 'No vendor lock']}
      >
        <CallToAction variant="primary-inverted" href="/docs">
          Get started
        </CallToAction>
        <CallToAction variant="secondary-inverted" href="/changelog">
          Changelog
        </CallToAction>
        <CallToAction
          variant="tertiary"
          href="https://github.com/graphql-hive/graphql-modules"
        >
          <GitHubIcon className="size-6" />
          GitHub
        </CallToAction>
      </Hero>
      <EverythingHTTPSection />
      <ToolsAndLibrariesCards />
    </div>
  );
}

function EverythingHTTPSection({ className }: { className?: string }) {
  return (
    <section className={cn('px-4 py-6 sm:py-12 md:px-6 lg:py-16', className)}>
      <Heading
        as="h2"
        size="md"
        className="text-balance sm:px-6 sm:text-center"
      >
        Integrates with any GraphQL Server
      </Heading>
      <p className="text-green-800 sm:text-center mt-4 text-balance">
        GraphQL Modules is a set of extra tools, structures and guidelines
        around your GraphQL schema. You’ll see how effective those tools are
        once you’ll start growing and scaling your GraphQL server.
      </p>
      <ul className="mt-6 grid md:grid-cols-2 xl:grid-cols-4 gap-2 md:mt-16 md:gap-6">
        <InfoCard
          as="li"
          heading="Reusable Modules"
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 100 100"
              width="24"
              height="24"
              fill="#fff"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M50 6.90308L87.323 28.4515V71.5484L50 93.0968L12.677 71.5484V28.4515L50 6.90308ZM16.8647 30.8693V62.5251L44.2795 15.0414L16.8647 30.8693ZM50 13.5086L18.3975 68.2457H81.6025L50 13.5086ZM77.4148 72.4334H22.5852L50 88.2613L77.4148 72.4334ZM83.1353 62.5251L55.7205 15.0414L83.1353 30.8693V62.5251Z"
              />
              <circle cx="50" cy="9.3209" r="8.82" />
              <circle cx="85.2292" cy="29.6605" r="8.82" />
              <circle cx="85.2292" cy="70.3396" r="8.82" />
              <circle cx="50" cy="90.6791" r="8.82" />
              <circle cx="14.7659" cy="70.3396" r="8.82" />
              <circle cx="14.7659" cy="29.6605" r="8.82" />
            </svg>
          }
          className="rounded-2xl md:rounded-3xl"
        >
          Modules are defined by their GraphQL schema (Schema first design).
        </InfoCard>
        <InfoCard
          as="li"
          heading="Scalable Structure"
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 18 18"
              fill="white"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M2.6999 8.14983H15.2999V2.74983H2.6999V8.14983ZM17.0999 1.84983V16.2498C17.0999 16.4885 17.0051 16.7174 16.8363 16.8862C16.6675 17.055 16.4386 17.1498 16.1999 17.1498H1.7999C1.56121 17.1498 1.33229 17.055 1.16351 16.8862C0.994723 16.7174 0.899902 16.4885 0.899902 16.2498V1.84983C0.899902 1.61113 0.994723 1.38222 1.16351 1.21343C1.33229 1.04465 1.56121 0.949829 1.7999 0.949829H16.1999C16.4386 0.949829 16.6675 1.04465 16.8363 1.21343C17.0051 1.38222 17.0999 1.61113 17.0999 1.84983ZM15.2999 9.94983H2.6999V15.3498H15.2999V9.94983ZM4.4999 11.7498H7.1999V13.5498H4.4999V11.7498ZM4.4999 4.54983H7.1999V6.34983H4.4999V4.54983Z" />
            </svg>
          }
          className="rounded-2xl md:rounded-3xl"
        >
          Manage multiple teams and features, multiple micro-services and
          servers.
        </InfoCard>
        <InfoCard
          as="li"
          heading="Gradual Growth"
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-chart-line"
            >
              <path d="M3 3v16a2 2 0 0 0 2 2h16" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
          }
          className="rounded-2xl md:rounded-3xl"
        >
          A clear, gradual path from a very simple and fast, single-file
          modules, to scalable ones.
        </InfoCard>
        <InfoCard
          as="li"
          heading="Testable"
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-test-tube-diagonal"
            >
              <path d="M21 7 6.82 21.18a2.83 2.83 0 0 1-3.99-.01a2.83 2.83 0 0 1 0-4L17 3" />
              <path d="m16 2 6 6" />
              <path d="M12 16H4" />
            </svg>
          }
          className="rounded-2xl md:rounded-3xl"
        >
          A rich toolset around testing, mocking and separation.
        </InfoCard>
      </ul>
    </section>
  );
}
