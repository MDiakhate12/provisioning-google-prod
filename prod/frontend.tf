provider "google" {
  project = var.project_id
}

// INTANCE TEMPLATE
resource "google_compute_instance_template" "RESOURCE_NAME_instance_template" {
  name_prefix  = "${var.vm_group_name}-frontend-"
  machine_type = "custom-${var.cpu}-${var.memory}"
  region       = var.region
  metadata_startup_script = templatefile(var.frontend.path, {
    PROJECT_NAME          = var.frontend.project_name
    PROJECT_REPOSITORY    = var.frontend.project_repository
    REACT_APP_BACKEND_URL = var.frontend.react_app_backend_url
    DOTENV                = var.frontend.dotenv
  })

  // boot disk
  disk {
    source_image = "${var.image_project}/${var.image_family}"
    disk_size_gb = var.disk_size_gb
    auto_delete  = true
    boot         = true
  }

  // networking
  network_interface {
    network = "default"
    access_config {}
  }

  tags = ["http-server", "https-server", "web", "frontend", "react", "prod"]

  lifecycle {
    create_before_destroy = true
  }
}

// MANAGED INSTANCE GROUP
resource "google_compute_instance_group_manager" "RESOURCE_NAME_instance_group" {
  name               = "${var.vm_group_name}-frontend"
  base_instance_name = "${var.vm_group_name}-frontend"
  zone               = var.zone

  // target_size        = 1
  // wait_for_instances = true

  version {
    instance_template = google_compute_instance_template.RESOURCE_NAME_instance_template.id
  }

  named_port {
    name = "http"
    port = 80
  }
}

// AUTOSCALER
resource "google_compute_autoscaler" "RESOURCE_NAME_autoscaler" {
  name   = "${var.vm_group_name}-frontend"
  zone   = var.zone
  target = google_compute_instance_group_manager.RESOURCE_NAME_instance_group.id

  autoscaling_policy {
    max_replicas    = 2
    min_replicas    = 1
    cooldown_period = 60

    cpu_utilization {
      target = 0.8
    }
  }
}

// LOAD BALANCER
module "gce-lb-http" {
  source  = "GoogleCloudPlatform/lb-http/google"
  version = "~> 4.4"

  project = var.project_id
  name    = "${var.vm_group_name}-frontend"

  target_tags = ["web", "frontend", "react", "prod"]


  backends = {
    default = {
      description            = null
      protocol               = "HTTP"
      port                   = 80
      port_name              = "http"
      timeout_sec            = 10
      enable_cdn             = false
      custom_request_headers = null
      security_policy        = null

      connection_draining_timeout_sec = null
      session_affinity                = null
      affinity_cookie_ttl_sec         = null

      health_check = {
        check_interval_sec  = null
        timeout_sec         = null
        healthy_threshold   = null
        unhealthy_threshold = null
        request_path        = "/"
        port                = 80
        host                = null
        logging             = null
      }

      log_config = {
        enable      = true
        sample_rate = 1.0
      }

      groups = [
        {
          # Each node pool instance group should be added to the backend.
          group                        = google_compute_instance_group_manager.RESOURCE_NAME_instance_group.instance_group
          balancing_mode               = null
          capacity_scaler              = null
          description                  = null
          max_connections              = null
          max_connections_per_instance = null
          max_connections_per_endpoint = null
          max_rate                     = null
          max_rate_per_instance        = null
          max_rate_per_endpoint        = null
          max_utilization              = null
        },
      ]

      iap_config = {
        enable               = false
        oauth2_client_id     = null
        oauth2_client_secret = null
      }
    }
  }
}

output "RESOURCE_NAME-load-balancer-ip" {
  value = module.gce-lb-http.external_ip
}

