const express = require("express");
const cors = require("cors");
const fs = require("fs");
const Compute = require("@google-cloud/compute");
const { Storage } = require("@google-cloud/storage");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

const PORT = process.env.PORT || 4000;
const WAIT_BEFORE_EXECUTE = 6000; // wait 6 seconds
const DEFAULT_TIMEOUT = 1000 * 60 * 10; // 10 minutes

const app = express();

const templateRepository = "template_repository";
const templateRegistry = "template_registry";

app.use(cors());
app.use(express.json());

const getName = (str) => str.split("/")[1];
const getPath = (str) => str.substring(str.lastIndexOf("/") + 1);

app.post("/", async (req, res) => {
  req.setTimeout(DEFAULT_TIMEOUT);
  res.setTimeout(DEFAULT_TIMEOUT);

  // return res.send(await getRules())

  try {
    const { instanceGroupName, stack } = req.body;

    let frontend = [
      "terraform/google/prod/frontend.template",
      "terraform/google/prod/variables.tf",
    ];

    let backend = [
      "terraform/google/prod/backend.template",
      "terraform/google/prod/variables.tf",
    ];

    let modules = {};

    switch (stack) {
      case "mern":
        modules = {
          frontend: "modules/react/prod/init-react.tpl",
          backend: "modules/nodejs/prod/init-nodejs.tpl",
        };
        break;

      case "sbam":
        modules = {
          frontend: "modules/angular/prod/init-angular.tpl",
          backend: "modules/springboot/prod/init-springboot.tpl",
        };
        break;

      default:
        break;
    }

    frontend.push(modules.frontend);
    backend.push(modules.backend);

    // Replace hyphens by underscores
    // let resourceName = instanceGroupName
    //   .replace(/-/g, "_")
    //   .trim()
    //   .toLowerCase();
    let folders = ["backend", "frontend"];
    // let folders = "backend"
    let timestamp = Date.now();

    // Download the files
    downloadFiles(frontend, "./terraform/frontend");

    downloadFiles(backend, "./terraform/backend");

    // Wait 3 seconds for the dowload
    setTimeout(() => {
      createTerraformVariableFile("backend", req.body, modules, "");

      executeTerraform("backend", instanceGroupName)
        .then(() => {
          fs.readFile("terraform/backend/ip", "utf-8", (err, data) => {
            if (err) {
              console.error(err);
              return;
            }
            createTerraformVariableFile("frontend", req.body, modules, data);

            executeTerraform("frontend", instanceGroupName)
              .then(async () => {
                // Export the generated terraform directory to template registry
                uploadFiles(folders, instanceGroupName, timestamp);

                // Get VM Instances
                getRules(instanceGroupName)
                  .then((loadBalancers) => {
                    console.log(loadBalancers);
                    res.send(loadBalancers);
                  })
                  .catch(console.error);
              })
              .catch((error) => {
                console.error(error);
                res.status(500).send("Error during creation.");
              });
          });
        })
        .catch((error) => {
          console.error(error);
          res.status(500).send("Error during creation.");
        });
    }, WAIT_BEFORE_EXECUTE);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error.");
  }
});

const downloadFiles = (files, path) => {
  // Creates a client
  const storage = new Storage();

  files.map(async (file) => {
    let destination = `${path}/${file.substring(file.lastIndexOf("/") + 1)}`;
    try {
      await storage
        .bucket(templateRepository)
        .file(file)
        .download({ destination });
      console.log(
        `gs://${templateRepository}/${file} downloaded to ${destination}.`
      );
    } catch (error) {
      console.error(error);
    }
  });
};

const uploadFiles = async (folders, instanceGroupName, timestamp) => {
  const storage = new Storage();

  if (typeof folders === "string") {
    let path = `terraform/${folders}`;

    return fs.readdir(path, async (err, files) => {
      if (err) {
        console.error(err);
        return;
      }

      console.log("TIMESTAMP:", timestamp);

      // Export and remove each file one by one
      files.forEach((file) => {
        if (!fs.statSync(`${path}/${file}`).isDirectory()) {
          let directory = path.substring(path.lastIndexOf("/") + 1);
          let destination = `${instanceGroupName}-${timestamp}/${directory}/${file}`;
          storage
            .bucket(templateRegistry)
            .upload(`${path}/${file}`, { destination })
            .then(async () => {
              console.log(`${file} uploaded successfuly`);
              // exec(`rm -rf ${path}/${file}`)
              //     .then((() => console.log(`Deleted ${file}.`)))
              //     .catch(console.error)
            })
            .catch(console.error);
        }
      });
      // exec(`rm -rf ${path}/.terraform`)
      //     .then((() => console.log("Deleted .terraform plugin folder.")))
      //     .catch(console.error)
    });
  } else if (folders instanceof Array) {
    return folders.forEach((folder) => {
      let path = `terraform/${folder}`;

      fs.readdir(path, async (err, files) => {
        if (err) {
          console.error(err);
          return;
        }

        console.log("TIMESTAMP:", timestamp);

        // Import and remove each file one by one
        files.forEach((file) => {
          if (!fs.statSync(`${path}/${file}`).isDirectory()) {
            let directory = path.substring(path.lastIndexOf("/") + 1);
            let destination = `${instanceGroupName}-${timestamp}/${directory}/${file}`;
            storage
              .bucket(templateRegistry)
              .upload(`${path}/${file}`, { destination })
              .then(async (uploadedFile) => {
                console.log(`${file} uploaded successfuly`);
                // exec(`rm -rf ${path}/${file}`)
                //     .then((() => console.log(`Deleted ${file}.`)))
                //     .catch(console.error)
              })
              .catch(console.error);
          }
        });
        // exec(`rm -rf ${path}/.terraform`)
        //     .then((() => console.log("Deleted .terraform plugin folder.")))
        //     .catch(console.error)
      });
    });
  }
};

const getInstances = async (prefix) => {
  const compute = new Compute();
  return compute
    .getVMs({ filter: `name eq ^${prefix}.*` })
    .then((data) => {
      let vms = data[0].map((element) => element.metadata);
      let newVMs = vms.map(({ name, networkInterfaces }) => ({
        name,
        publicIP: networkInterfaces[0].accessConfigs[0].natIP,
        privateIP: networkInterfaces[0].networkIP,
      }));

      console.log(newVMs);

      return newVMs;
    })
    .catch(console.error);
};

const getRules = async (instanceGroupName) => {
  return exec(
    `gcloud compute forwarding-rules list --format json --filter name:${instanceGroupName}*`
  )
    .then(async ({ stdout, stderr, error }) => {
      if (error) {
        console.error(error);
        return;
      }

      // Log output
      if (stderr) {
        console.log(`stderr${stderr}`);
        return;
      }
      let rules = JSON.parse(stdout);
      return rules.map(({ name, IPAddress, loadBalancingScheme }) => ({
        name,
        IPAddress,
        loadBalancingScheme,
      }));
    })
    .catch((error) => {
      console.error(error);
      return;
    });
};

const createTerraformVariableFile = async (
  folder,
  body,
  modules,
  backend_url = ""
) => {
  const {
    numberOfVm,
    instanceGroupName,
    cpu,
    memory,
    disk,
    osType,
    osImage,
    applicationType,
    frontendOptions,
    backendOptions,
  } = body;

  let instance = {
    number_of_vm: numberOfVm,
    vm_group_name: instanceGroupName,
    cpu: cpu,
    memory: memory,
    disk_size_gb: disk,
    image_project: osType,
    image_family: osImage,
    application_type: applicationType,
    region: "us-central1",
    zone: "us-central1-a",
    frontend: {
      backend_url: "",
      dotenv: ".env",
    },
    backend: {},
  };

  if (process.env.USER) {
    instance["user"] = process.env.USER;
  }

  for (let [key, value] of Object.entries(modules)) {
    instance[key]["name"] = getName(value);
    instance[key]["path"] = getPath(value);
  }

  for (let [key, value] of Object.entries(frontendOptions)) {
    instance["frontend"][key] = value;
    if (key === "project_repository")
      instance["frontend"]["project_name"] = value
        .replace(".git", "")
        .substring(value.lastIndexOf("/") + 1);
  }

  for (let [key, value] of Object.entries(backendOptions)) {
    instance["backend"][key] = value;
    if (key === "project_repository")
      instance["backend"]["project_name"] = value
        .replace(".git", "")
        .substring(value.lastIndexOf("/") + 1);
  }

  if (backend_url !== "") {
    instance["frontend"]["backend_url"] = !(
      backend_url.startsWith("http") || backend_url.startsWith("https")
    )
      ? `http://${backend_url}`
      : backend_url;

    console.log(instance["frontend"]["backend_url"]);
  }

  if (process.env.KEY_LOCATION) {
    let keyLocation = process.env.KEY_LOCATION;

    instance["private_key"] = keyLocation;
    instance["public_key"] = `${keyLocation}.pub`;
  }

  fs.writeFileSync(
    `terraform/${folder}/${instanceGroupName}.auto.tfvars.json`,
    JSON.stringify(instance)
  );
  console.log(
    `Created file terraform/${folder}/${instanceGroupName}.auto.tfvars.json from request...`
  );
};

const executeTerraform = async (folders, resourceName) => {
  if (typeof folders === "string") {
    return (
      exec(`make terraform-apply-${folders} RESOURCE_NAME=${resourceName}`)
        // When success
        .then(async ({ stdout, stderr, error }) => {
          if (error) {
            console.error(error);
            return;
          }

          // Log output
          if (stderr) console.log(`stderr: ${stderr}`);
          if (stdout) console.log(`stdout: ${stdout}`);
        })
        .catch((error) => {
          console.error(error);
          return;
        })
    );
  } else if (folders instanceof Array) {
    return folders.forEach((folder) => {
      console.log("FOLDER:", folder);

      exec(`make terraform-apply-${folder} RESOURCE_NAME=${resourceName}`)
        // When success
        .then(async ({ stdout, stderr, error }) => {
          if (error) {
            console.error(error);
            return;
          }

          // Log output
          if (stderr) console.log(`stderr: ${stderr}`);
          if (stdout) console.log(`stdout: ${stdout}`);
        })
        .catch((error) => {
          console.error(error);
          return;
        });
    });
  }
};

let server = app.listen(PORT, () => {
  console.log("Listenning on port: ", PORT);
});

server.timeout = DEFAULT_TIMEOUT; // 10 minutes before socket hang up
