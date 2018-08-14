import Sequelize from 'sequelize';

import { createServer } from 'backend/server';
import * as sdkGeneration from 'client/sdkGeneration';
import { Plan, BuildStatus } from 'model/Plan';
import { Spec } from 'model/Spec';

/*
 * Test services are registered and any hooks.
 */
describe('test server', () => {
  let app;
  beforeAll(async () => {
    // TODO: Might need to change to beforeEach if data is stored and queried.

    // Mock out the database connection.
    const dbConnection = new Sequelize('database', 'username', 'password', {
      host: 'localhost',
      dialect: 'sqlite',
      logging: () => {}, // Don't log what happens to the db.
    });

    app = await createServer(dbConnection);
  });

  describe('test specification service', () => {
    it('specification service registered', () => {
      const s = app.service('specifications');
      expect(s).toEqual(expect.anything());
    });
  });

  describe('test plans service', () => {
    let createdSpecId: number;
    let planData: Plan;
    const specData: Spec = {
      title: 'title',
      description: 'desc',
      path: 'path',
    };
    beforeAll(async () => {
      // Need a spec to add plans to.
      const createdSpec = await app.service('specifications').create(specData);
      createdSpecId = createdSpec.id;
      planData = {
        specId: createdSpecId,
        target: 'java is ew',
        version: 'v1.0.0',
        options: { 'a choice': 'my options here' },
        buildStatus: BuildStatus.Success,
      };
    });

    it('plans service registered', () => {
      const s = app.service('plans');
      expect(s).toEqual(expect.anything());
    });

    it('plan created', async () => {
      const createdPlan = await app.service('plans').create(planData);
      const retrievedPlan = await app.service('plans').get(createdPlan.id);
      const basicFields = ['specId', 'target', 'version', 'buildStatus'];
      // Compare the objects, need to do it this way because objects are stored as strings.
      basicFields.forEach(key => {
        expect(planData[key]).toEqual(createdPlan[key]);
        expect(planData[key]).toEqual(retrievedPlan[key]);
      });
      expect(planData.options).toEqual(createdPlan.options);
      expect(JSON.stringify(planData.options)).toEqual(retrievedPlan.options);
    });

    it('plan created hook sets buildStatus to BuildStatus.NotRun', async () => {
      const { buildStatus, ...planDataWithoutBuildStatus } = planData;
      const createdPlan = await app.service('plans').create(planDataWithoutBuildStatus);
      const bs = (await app.service('plans').get(createdPlan.id)).buildStatus;
      expect(bs).toEqual(BuildStatus.NotRun);
    });
  });

  describe('test sdks service', () => {
    it('sdks service registered', () => {
      const s = app.service('sdks');
      expect(s).toEqual(expect.anything());
    });

    describe('test creating/generating sdks', () => {
      // A spec and plan need to be created before a SDK can be.
      // TODO: Should there be a model for SDK?

      it('create a sdk success', async () => {
        const specData: Spec = {
          title: 'Dummy specification title',
          description: 'A description of my specification',
          path:
            'this fake path will actually lead to an error but that is ok since we are mocking it',
        };
        const createdSpec = await app.service('specifications').create(specData);

        const planData: Plan = {
          specId: createdSpec.id,
          target: 'Kewl kids use Haskell',
          version: 'v1.1.1',
          buildStatus: BuildStatus.NotRun,
          options: {
            additionalProp1: 'string',
            additionalProp2: 'string',
          },
        };
        const createdPlan = await app.service('plans').create(planData);

        const sdkData = { planId: createdPlan.id };

        const expectedGenerationResponse = {
          planId: 1,
          path: 'base-url-here/download/unique-download-hash-here',
        };

        // Mock the response of generateSdk to be successful.
        const spy = jest.spyOn(sdkGeneration, 'generateSdk').mockImplementation(() => {
          return expectedGenerationResponse;
        });

        const createdSdk = await app.service('sdks').create(sdkData);

        // generateSdk() called once.
        expect(spy).toHaveBeenCalledTimes(1);
        // SDK created for the right plan.
        expect(createdSdk.planId).toBe(createdPlan.id);
        // SDK created & stored in memory.
        const retrievedSdk = await app.service('sdks').get(createdSdk.id);
        // Check return link, it is called path in the sdk model.
        expect(createdSdk.path).toEqual(expectedGenerationResponse.path);
        expect(createdSdk.path).toEqual(retrievedSdk.path);
        // Check id.
        expect(createdSdk.id).toEqual(retrievedSdk.id);
      });

      it('create a sdk error, bad options', async () => {
        const specData: Spec = {
          title: 'Dummy specification title',
          description: 'A description of my specification',
          path:
            'this fake path will actually lead to an error but that is ok since we are mocking it',
        };
        const createdSpec = await app.service('specifications').create(specData);

        const planData: Plan = {
          specId: createdSpec.id,
          target: 'Kewl kids use Haskell',
          version: 'v1.1.1',
          options: 'options should be an object and not a string',
          buildStatus: BuildStatus.NotRun,
        };

        const createdPlan = await app.service('plans').create(planData);

        const sdkData = { planId: createdPlan.id };

        const spy = jest.spyOn(sdkGeneration, 'generateSdk').mockImplementation(() => {
          const swaggerCodegenMalformedOptionsResponse = {
            code: 500,
            type: 'unknown',
            message: 'something bad happened',
          };
          throw new Error(swaggerCodegenMalformedOptionsResponse.message);
        });

        let createdSdk;
        let errorMessage;
        try {
          createdSdk = await app.service('sdks').create(sdkData);
        } catch (err) {
          errorMessage = err.toString();
        }

        // generateSdk() called once.
        expect(spy).toHaveBeenCalledTimes(1);
        // SDK not created.
        expect(createdSdk).toBe(undefined);
        // Error throw with right message.
        expect(errorMessage).toEqual('Error: something bad happened');
      });

      it('create a sdk error, invalid path', async () => {
        const specData: Spec = {
          title: 'Dummy specification title',
          description: 'A description of my specification',
          path: 'this fake path will lead to an error this time yay',
        };
        const createdSpec = await app.service('specifications').create(specData);

        const planData: Plan = {
          specId: createdSpec.id,
          target: 'Kewl kids use Haskell',
          version: 'v1.1.1',
          buildStatus: BuildStatus.NotRun,
        };

        const createdPlan = await app.service('plans').create(planData);

        const sdkData = { planId: createdPlan.id };
        const spy = jest.spyOn(sdkGeneration, 'generateSdk').mockImplementation(() => {
          const swaggerCodegenInvalidSpecificationResponse = {
            code: 1,
            type: 'error',
            message: 'The swagger specification supplied was not valid',
          };
          throw new Error(swaggerCodegenInvalidSpecificationResponse.message);
        });

        let createdSdk;
        let errorMessage;
        try {
          createdSdk = await app.service('sdks').create(sdkData);
        } catch (err) {
          errorMessage = err.toString();
        }

        // generateSdk() called once.
        expect(spy).toHaveBeenCalledTimes(1);
        // SDK not created.
        expect(createdSdk).toBe(undefined);
        // Error throw with right message.
        expect(errorMessage).toEqual(
          'Error: The swagger specification supplied was not valid',
        );
      });
    });
  });
});