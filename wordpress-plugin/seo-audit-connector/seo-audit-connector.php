<?php
/**
 * Plugin Name:       SEO Audit Connector
 * Plugin URI:        https://example.com/seo-audit
 * Description:        Conectează acest site la platforma SEO Audit. Repară transmiterea header-ului Authorization (necesar pentru Application Passwords), generează parola de conectare dintr-un singur click și expune endpoint-uri REST sigure pentru audit și aplicarea fix-urilor — funcționează chiar dacă REST API-ul standard e restricționat.
 * Version:           0.1.0
 * Requires at least: 5.6
 * Requires PHP:      7.4
 * Author:            SEO Audit
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       seo-audit-connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'SEO_AUDIT_CONNECTOR_VERSION', '0.1.0' );
define( 'SEO_AUDIT_CONNECTOR_NS', 'seo-audit/v1' );

/* -------------------------------------------------------------------------
 * 1. Authorization header fix
 *
 * Many shared hosts (Apache/CGI, LiteSpeed, some Nginx setups) do not pass the
 * HTTP Authorization header to PHP, so WordPress never sees the Application
 * Password. Rebuild PHP_AUTH_USER / PHP_AUTH_PW from the alternatives. Runs at
 * plugin load — before WordPress resolves the current user.
 * ---------------------------------------------------------------------- */
if ( empty( $_SERVER['PHP_AUTH_USER'] ) ) {
	$sac_auth = '';
	foreach ( array( 'HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION', 'REDIRECT_REDIRECT_HTTP_AUTHORIZATION' ) as $sac_key ) {
		if ( ! empty( $_SERVER[ $sac_key ] ) ) {
			$sac_auth = $_SERVER[ $sac_key ];
			break;
		}
	}
	if ( '' === $sac_auth && function_exists( 'getallheaders' ) ) {
		foreach ( (array) getallheaders() as $sac_name => $sac_value ) {
			if ( 'authorization' === strtolower( (string) $sac_name ) ) {
				$sac_auth = $sac_value;
				break;
			}
		}
	}
	if ( 0 === stripos( (string) $sac_auth, 'basic ' ) ) {
		$sac_decoded = base64_decode( substr( $sac_auth, 6 ), true );
		if ( $sac_decoded && false !== strpos( $sac_decoded, ':' ) ) {
			list( $sac_u, $sac_p )    = explode( ':', $sac_decoded, 2 );
			$_SERVER['PHP_AUTH_USER'] = $sac_u;
			$_SERVER['PHP_AUTH_PW']   = $sac_p;
		}
	}
	unset( $sac_auth, $sac_key, $sac_name, $sac_value, $sac_decoded, $sac_u, $sac_p );
}

/* -------------------------------------------------------------------------
 * 2. Helpers
 * ---------------------------------------------------------------------- */

function sac_detect_seo_plugin() {
	if ( defined( 'WPSEO_VERSION' ) || defined( 'WPSEO_FILE' ) ) {
		return 'yoast';
	}
	if ( class_exists( 'RankMath' ) || defined( 'RANK_MATH_VERSION' ) ) {
		return 'rankmath';
	}
	return null;
}

function sac_meta_keys( $plugin ) {
	if ( 'yoast' === $plugin ) {
		return array(
			'title'       => '_yoast_wpseo_title',
			'description' => '_yoast_wpseo_metadesc',
		);
	}
	if ( 'rankmath' === $plugin ) {
		return array(
			'title'       => 'rank_math_title',
			'description' => 'rank_math_description',
		);
	}
	return array(
		'title'       => '_seo_audit_title',
		'description' => '_seo_audit_metadesc',
	);
}

function sac_user_caps() {
	return array(
		'edit_posts'     => current_user_can( 'edit_posts' ),
		'edit_pages'     => current_user_can( 'edit_pages' ),
		'upload_files'   => current_user_can( 'upload_files' ),
		'manage_options' => current_user_can( 'manage_options' ),
	);
}

/* -------------------------------------------------------------------------
 * 3. REST namespace: seo-audit/v1
 * ---------------------------------------------------------------------- */

add_action( 'rest_api_init', function () {

	$can_edit = function () {
		return current_user_can( 'edit_posts' );
	};

	register_rest_route( SEO_AUDIT_CONNECTOR_NS, '/ping', array(
		'methods'             => 'GET',
		'permission_callback' => $can_edit,
		'callback'            => function () {
			$types = array();
			foreach ( get_post_types( array( 'public' => true ), 'names' ) as $t ) {
				$types[] = $t;
			}
			return array(
				'ok'             => true,
				'plugin_version' => SEO_AUDIT_CONNECTOR_VERSION,
				'wp_version'     => get_bloginfo( 'version' ),
				'php_version'    => PHP_VERSION,
				'site_url'       => site_url(),
				'home_url'       => home_url(),
				'user'           => array(
					'id'    => get_current_user_id(),
					'login' => wp_get_current_user()->user_login,
					'caps'  => sac_user_caps(),
				),
				'seo_plugin'     => sac_detect_seo_plugin(),
				'types'          => $types,
			);
		},
	) );

	register_rest_route( SEO_AUDIT_CONNECTOR_NS, '/resolve', array(
		'methods'             => 'GET',
		'permission_callback' => $can_edit,
		'args'                => array(
			'url' => array( 'required' => true, 'type' => 'string' ),
		),
		'callback'            => function ( WP_REST_Request $req ) {
			$url = esc_url_raw( $req->get_param( 'url' ) );
			$id  = url_to_postid( $url );
			if ( ! $id ) {
				// Fallback: match by trailing slug.
				$slug = sanitize_title( basename( untrailingslashit( wp_parse_url( $url, PHP_URL_PATH ) ) ) );
				if ( $slug ) {
					$hit = get_posts( array(
						'name'        => $slug,
						'post_type'   => array( 'post', 'page' ),
						'post_status' => 'publish',
						'numberposts' => 1,
					) );
					if ( $hit ) {
						$id = $hit[0]->ID;
					}
				}
			}
			if ( ! $id ) {
				return new WP_Error( 'sac_not_found', 'No post/page matches that URL', array( 'status' => 404 ) );
			}
			$post   = get_post( $id );
			$plugin = sac_detect_seo_plugin();
			$keys   = sac_meta_keys( $plugin );
			return array(
				'id'   => $id,
				'type' => $post->post_type,
				'slug' => $post->post_name,
				'meta' => array(
					'title'       => (string) get_post_meta( $id, $keys['title'], true ),
					'description' => (string) get_post_meta( $id, $keys['description'], true ),
				),
			);
		},
	) );

	register_rest_route( SEO_AUDIT_CONNECTOR_NS, '/apply', array(
		'methods'             => 'POST',
		'permission_callback' => $can_edit,
		'callback'            => 'sac_rest_apply',
	) );

	register_rest_route( SEO_AUDIT_CONNECTOR_NS, '/rollback', array(
		'methods'             => 'POST',
		'permission_callback' => $can_edit,
		'callback'            => 'sac_rest_rollback',
	) );
} );

function sac_rest_apply( WP_REST_Request $req ) {
	$kind = $req->get_param( 'kind' );

	if ( 'alt' === $kind ) {
		$media_id = (int) $req->get_param( 'media_id' );
		$alt      = (string) $req->get_param( 'alt_text' );
		if ( ! $media_id || 'attachment' !== get_post_type( $media_id ) ) {
			return new WP_Error( 'sac_bad_media', 'media_id is not an attachment', array( 'status' => 422 ) );
		}
		if ( ! current_user_can( 'upload_files' ) ) {
			return new WP_Error( 'sac_forbidden', 'Missing upload_files capability', array( 'status' => 403 ) );
		}
		$prev = (string) get_post_meta( $media_id, '_wp_attachment_image_alt', true );
		update_post_meta( $media_id, '_wp_attachment_image_alt', sanitize_text_field( $alt ) );
		return array(
			'applied'  => true,
			'kind'     => 'alt',
			'media_id' => $media_id,
			'previous' => array( 'alt_text' => $prev ),
		);
	}

	// kind === 'meta'
	$object_id = (int) $req->get_param( 'object_id' );
	$post      = $object_id ? get_post( $object_id ) : null;
	if ( ! $post ) {
		return new WP_Error( 'sac_bad_object', 'object_id not found', array( 'status' => 422 ) );
	}
	if ( ! current_user_can( 'edit_post', $object_id ) ) {
		return new WP_Error( 'sac_forbidden', 'Cannot edit this object', array( 'status' => 403 ) );
	}

	$plugin   = sac_detect_seo_plugin();
	$keys     = sac_meta_keys( $plugin );
	$previous = array( 'seo_plugin' => $plugin );

	$title = $req->get_param( 'meta_title' );
	$desc  = $req->get_param( 'meta_description' );

	if ( null !== $title ) {
		$previous[ $keys['title'] ] = (string) get_post_meta( $object_id, $keys['title'], true );
		update_post_meta( $object_id, $keys['title'], sanitize_text_field( $title ) );
	}
	if ( null !== $desc ) {
		$previous[ $keys['description'] ] = (string) get_post_meta( $object_id, $keys['description'], true );
		update_post_meta( $object_id, $keys['description'], sanitize_text_field( $desc ) );
	}

	return array(
		'applied'     => true,
		'kind'        => 'meta',
		'object_type' => $post->post_type,
		'object_id'   => $object_id,
		'previous'    => $previous,
	);
}

function sac_rest_rollback( WP_REST_Request $req ) {
	$kind     = $req->get_param( 'kind' );
	$previous = (array) $req->get_param( 'previous' );

	if ( 'alt' === $kind ) {
		$media_id = (int) $req->get_param( 'media_id' );
		if ( ! $media_id || ! current_user_can( 'upload_files' ) ) {
			return new WP_Error( 'sac_forbidden', 'Cannot roll back alt text', array( 'status' => 403 ) );
		}
		update_post_meta( $media_id, '_wp_attachment_image_alt', sanitize_text_field( (string) ( $previous['alt_text'] ?? '' ) ) );
		return array( 'rolled_back' => true );
	}

	$object_id = (int) $req->get_param( 'object_id' );
	if ( ! $object_id || ! current_user_can( 'edit_post', $object_id ) ) {
		return new WP_Error( 'sac_forbidden', 'Cannot roll back this object', array( 'status' => 403 ) );
	}
	foreach ( $previous as $key => $value ) {
		if ( 'seo_plugin' === $key ) {
			continue;
		}
		update_post_meta( $object_id, $key, sanitize_text_field( (string) $value ) );
	}
	return array( 'rolled_back' => true );
}

/* -------------------------------------------------------------------------
 * 4. Render our own <title> / meta description when no SEO plugin is active
 * ---------------------------------------------------------------------- */

add_filter( 'document_title_parts', function ( $parts ) {
	if ( sac_detect_seo_plugin() || ! is_singular() ) {
		return $parts;
	}
	$t = get_post_meta( get_queried_object_id(), '_seo_audit_title', true );
	if ( $t ) {
		$parts['title'] = $t;
	}
	return $parts;
} );

add_action( 'wp_head', function () {
	if ( sac_detect_seo_plugin() || ! is_singular() ) {
		return;
	}
	$d = get_post_meta( get_queried_object_id(), '_seo_audit_metadesc', true );
	if ( $d ) {
		echo '<meta name="description" content="' . esc_attr( $d ) . '" />' . "\n";
	}
}, 1 );

/* -------------------------------------------------------------------------
 * 5. Admin page: Settings → SEO Audit  (generate the connection password)
 * ---------------------------------------------------------------------- */

add_action( 'admin_menu', function () {
	add_options_page(
		'SEO Audit',
		'SEO Audit',
		'manage_options',
		'seo-audit-connector',
		'sac_render_admin_page'
	);
} );

function sac_render_admin_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	$new_password = null;
	$error        = null;

	if ( isset( $_POST['sac_generate'] ) && check_admin_referer( 'sac_generate' ) ) {
		if ( ! function_exists( 'wp_is_application_passwords_available' ) || ! wp_is_application_passwords_available() ) {
			$error = 'Application Passwords sunt dezactivate pe acest site (necesită HTTPS sau au fost oprite de un plugin de securitate).';
		} else {
			$created = WP_Application_Passwords::create_new_application_password(
				get_current_user_id(),
				array( 'name' => 'SEO Audit (' . gmdate( 'Y-m-d H:i' ) . ')' )
			);
			if ( is_wp_error( $created ) ) {
				$error = $created->get_error_message();
			} else {
				$new_password = $created[0]; // plaintext, shown once
			}
		}
	}

	$user      = wp_get_current_user();
	$site_url  = site_url();
	$rest_ok   = get_rest_url( null, SEO_AUDIT_CONNECTOR_NS . '/ping' );
	?>
	<div class="wrap">
		<h1>SEO Audit — conectare</h1>
		<p>Folosește datele de mai jos în platforma SEO Audit, la <strong>Conectează WordPress</strong>.</p>

		<table class="form-table" role="presentation">
			<tr>
				<th scope="row">URL site</th>
				<td><code><?php echo esc_html( $site_url ); ?></code></td>
			</tr>
			<tr>
				<th scope="row">Utilizator</th>
				<td><code><?php echo esc_html( $user->user_login ); ?></code>
					<?php if ( ! current_user_can( 'edit_posts' ) ) : ?>
						<span style="color:#b32d2e"> — atenție: acest user nu poate edita conținut.</span>
					<?php endif; ?>
				</td>
			</tr>
			<tr>
				<th scope="row">Plugin SEO detectat</th>
				<td><code><?php echo esc_html( sac_detect_seo_plugin() ?: 'niciunul (folosim câmpuri proprii)' ); ?></code></td>
			</tr>
			<tr>
				<th scope="row">Endpoint verificare</th>
				<td><code><?php echo esc_html( $rest_ok ); ?></code></td>
			</tr>
		</table>

		<?php if ( $error ) : ?>
			<div class="notice notice-error"><p><?php echo esc_html( $error ); ?></p></div>
		<?php endif; ?>

		<?php if ( $new_password ) : ?>
			<div class="notice notice-success">
				<p><strong>Parolă de aplicație generată.</strong> Se afișează o singură dată — copiaz-o acum:</p>
				<p><input type="text" readonly class="large-text code" value="<?php echo esc_attr( $new_password ); ?>" onclick="this.select()"></p>
			</div>
		<?php endif; ?>

		<form method="post">
			<?php wp_nonce_field( 'sac_generate' ); ?>
			<p>
				<button type="submit" name="sac_generate" class="button button-primary">
					Generează parolă de conectare
				</button>
			</p>
			<p class="description">
				Creează o Application Password pentru contul tău (<?php echo esc_html( $user->user_login ); ?>),
				pe care o folosești în platforma SEO Audit. O poți revoca oricând din
				<a href="<?php echo esc_url( admin_url( 'profile.php#application-passwords-section' ) ); ?>">profilul tău</a>.
			</p>
		</form>
	</div>
	<?php
}

add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), function ( $links ) {
	$links[] = '<a href="' . esc_url( admin_url( 'options-general.php?page=seo-audit-connector' ) ) . '">Conectare</a>';
	return $links;
} );
